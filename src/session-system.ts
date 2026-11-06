import {
  createSystem,
  Entity,
  GrabSystem,
  Grabbed,
  Object3D,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { FAST_SESSION_SECONDS, isFastMode } from './dev-flags.js';
import { FocusOrb } from './orb-components.js';
import { ReleaseTracker } from './release-tracker.js';
import {
  isOnboarded,
  loadPrefs,
  loadStats,
  recordCompletedSession,
  savePrefs,
  setOnboarded,
} from './storage.js';

/** Onboarding hint steps (see SessionUISystem for the copy). */
const HINT_GRAB = 0;
const HINT_DRAG = 1;
const HINT_TAP = 2;
const HINT_DONE = 3;
import {
  DURATIONS_MIN,
  EnvChoice,
  FocusSession,
  MuteToggle,
  SessionOutcome,
  SessionPhase,
} from './session-components.js';

/** Seconds for the passthrough <-> environment cross-fades. */
export const FADE_SECONDS = 3;
/** A pinch shorter than this with little travel counts as a tap. */
const TAP_MAX_SECONDS = 0.4;
/** Dev fast mode allows slow taps so slow emulators/recorders can trigger them. */
const FAST_TAP_MAX_SECONDS = 3;
const TAP_MAX_TRAVEL = 0.025;
/** Horizontal hand travel that turns a pinch into a move. */
const MOVE_START = 0.04;
/** Vertical hand travel that turns a pinch into a time-dial drag. */
const DIAL_START = 0.03;
/** Vertical travel per duration step while dialing. */
const DIAL_STEP = 0.05;
/** Horizontal travel that aborts a dial into a move (time is restored). */
const DIAL_ABORT = 0.1;
/** Release hand speed (m/s) that counts as a flick and cancels a session. */
const FLICK_SPEED = 1.2;
/** Seconds the finish card stays up after a completed session. */
const CARD_SECONDS = 6;

type GrabMode = 'pending' | 'dial' | 'move';

/**
 * Turns pinches on the orb into Deeproom's session loop: vertical drag dials
 * the duration, a quick tap starts the session, and the timer advances the
 * FocusSession phase (fade in, run, fade out).
 */
export class SessionSystem extends createSystem({
  orbs: { required: [FocusOrb, FocusSession] },
  heldOrbs: { required: [FocusOrb, FocusSession, Grabbed] },
  pinchedEnvChoices: { required: [EnvChoice, Grabbed] },
  pinchedMute: { required: [MuteToggle, Grabbed] },
}) {
  private grabSystem: GrabSystem | undefined;
  private initialized = new WeakSet<Entity>();
  private hand = new Vector3();
  private startHand = new Vector3();
  private restPos = new Vector3();
  private local = new Vector3();
  private holding = false;
  private holderHand: 'left' | 'right' | null = null;
  private grabSeconds = 0;
  private travel = 0;
  private mode: GrabMode = 'pending';
  private baseIndex = 0;
  private release = new ReleaseTracker();
  private returning: Entity | null = null;
  private blurred = false;

  init(): void {
    this.grabSystem = this.world.getSystem(GrabSystem);
    for (const entity of this.queries.orbs.entities) this.setup(entity);
    this.cleanupFuncs.push(
      this.queries.orbs.subscribe('qualify', (e) => this.setup(e)),
      this.queries.heldOrbs.subscribe('qualify', (e) => this.onGrabStart(e)),
      this.queries.heldOrbs.subscribe('disqualify', (e) => {
        if (e.active) this.onGrabEnd(e);
      }),
      this.queries.pinchedEnvChoices.subscribe('qualify', (e) => this.onPickEnv(e)),
      this.queries.pinchedMute.subscribe('qualify', () => this.onToggleMute()),
      this.world.visibilityState.subscribe((state) => {
        this.blurred = state === VisibilityState.VisibleBlurred;
        if (state === VisibilityState.NonImmersive) this.abortAll();
      }),
    );
  }

  private setup(entity: Entity): void {
    if (this.initialized.has(entity)) return;
    this.initialized.add(entity);
    entity.setValue(FocusSession, 'fastMode', isFastMode());
    const prefs = loadPrefs();
    entity.setValue(FocusSession, 'durationIndex', prefs.durationIndex);
    entity.setValue(FocusSession, 'envIndex', prefs.envIndex);
    entity.setValue(FocusSession, 'muted', prefs.muted);
    entity.setValue(FocusSession, 'hintStep', isOnboarded() ? HINT_DONE : HINT_GRAB);
    const stats = loadStats();
    entity.setValue(FocusSession, 'sessions', stats.sessions);
    entity.setValue(FocusSession, 'streak', stats.streak);
  }

  /** Persists the user's duration, environment and mute choices. */
  protected persistPrefs(entity: Entity): void {
    savePrefs({
      durationIndex: entity.getValue(FocusSession, 'durationIndex') ?? 2,
      envIndex: entity.getValue(FocusSession, 'envIndex') ?? 0,
      muted: entity.getValue(FocusSession, 'muted') ?? false,
    });
  }

  /** Pinching an environment orb selects it (between sessions only). */
  private onPickEnv(choice: Entity): void {
    const envIndex = choice.getValue(EnvChoice, 'envIndex') ?? 0;
    for (const orb of this.queries.orbs.entities) {
      if (orb.getValue(FocusSession, 'phase') !== SessionPhase.Idle) continue;
      orb.setValue(FocusSession, 'envIndex', envIndex);
      this.persistPrefs(orb);
    }
  }

  /** Pinching the mute token toggles all Deeproom audio, any time. */
  private onToggleMute(): void {
    for (const orb of this.queries.orbs.entities) {
      orb.setValue(FocusSession, 'muted', !orb.getValue(FocusSession, 'muted'));
      this.persistPrefs(orb);
    }
  }

  update(delta: number): void {
    for (const entity of this.queries.orbs.entities) {
      if (this.holding && entity.hasComponent(Grabbed)) {
        this.trackHeld(entity, delta);
      }
      this.advance(entity, delta);
    }
    this.updateReturn(delta);
  }

  private updateReturn(delta: number): void {
    const entity = this.returning;
    const object = entity?.object3D;
    if (entity == null || object == null || !entity.active || entity.hasComponent(Grabbed)) {
      this.returning = null;
      return;
    }
    object.getWorldPosition(this.hand);
    if (this.hand.distanceToSquared(this.restPos) < 1e-6) {
      this.setWorldPosition(entity, this.restPos);
      this.returning = null;
      return;
    }
    this.hand.lerp(this.restPos, Math.min(1, delta * 8));
    this.setWorldPosition(entity, this.hand);
  }

  private readHand(out: Vector3, entity: Entity): void {
    const spaces = this.player.gripSpaces;
    const space: Object3D | undefined =
      this.holderHand === 'left' ? spaces.left : spaces.right;
    if (space) space.getWorldPosition(out);
    else entity.object3D?.getWorldPosition(out);
  }

  private onGrabStart(entity: Entity): void {
    this.holding = true;
    this.holderHand = this.grabSystem?.getHolderHand(entity) ?? 'right';
    this.readHand(this.startHand, entity);
    this.release.reset(this.startHand.x, this.startHand.y, this.startHand.z);
    this.returning = null;
    entity.object3D?.getWorldPosition(this.restPos);
    this.grabSeconds = 0;
    this.travel = 0;
    this.mode = 'pending';
    this.baseIndex = entity.getValue(FocusSession, 'durationIndex') ?? 2;
    entity.setValue(FocusSession, 'cardTime', 0);
    this.advanceHint(entity, HINT_GRAB, HINT_DRAG);
  }

  /** Moves onboarding from step `from` to `to`; finishing it is remembered. */
  private advanceHint(entity: Entity, from: number, to: number): void {
    if (entity.getValue(FocusSession, 'hintStep') !== from) return;
    entity.setValue(FocusSession, 'hintStep', to);
    if (to === HINT_DONE) setOnboarded();
  }

  private trackHeld(entity: Entity, delta: number): void {
    this.readHand(this.hand, entity);
    this.grabSeconds += delta;
    this.release.sample(this.hand.x, this.hand.y, this.hand.z, delta);
    const dx = this.hand.x - this.startHand.x;
    const dy = this.hand.y - this.startHand.y;
    const dz = this.hand.z - this.startHand.z;
    this.travel = Math.max(this.travel, Math.sqrt(dx * dx + dy * dy + dz * dz));

    if (entity.getValue(FocusSession, 'phase') !== SessionPhase.Idle) return;
    const horizontal = Math.sqrt(dx * dx + dz * dz);
    if (this.mode === 'pending') {
      if (horizontal > MOVE_START) this.mode = 'move';
      else if (Math.abs(dy) > DIAL_START) this.mode = 'dial';
    }
    if (this.mode !== 'dial') return;

    if (horizontal > DIAL_ABORT) {
      this.mode = 'move';
      entity.setValue(FocusSession, 'durationIndex', this.baseIndex);
      return;
    }
    const last = DURATIONS_MIN.length - 1;
    const index = Math.min(
      last,
      Math.max(0, this.baseIndex + Math.round(dy / DIAL_STEP)),
    );
    if (index !== entity.getValue(FocusSession, 'durationIndex')) {
      entity.setValue(FocusSession, 'durationIndex', index);
      this.advanceHint(entity, HINT_DRAG, HINT_TAP);
    }
    // Keep the orb at rest while dialing, with a slight follow for feedback.
    this.local.copy(this.restPos);
    this.local.y += Math.max(-0.015, Math.min(0.015, dy * 0.2));
    this.setWorldPosition(entity, this.local);
  }

  private onGrabEnd(entity: Entity): void {
    this.holding = false;
    const phase = entity.getValue(FocusSession, 'phase');
    if (phase === SessionPhase.FadingIn || phase === SessionPhase.Running) {
      if (this.release.isFlick(FLICK_SPEED)) {
        this.finish(entity, false);
        this.returning = entity; // ease the thrown orb back to its rest spot
      }
      return;
    }
    if (phase !== SessionPhase.Idle) return;
    if (this.mode === 'dial') {
      this.setWorldPosition(entity, this.restPos);
      this.persistPrefs(entity);
      return;
    }
    const tapWindow = entity.getValue(FocusSession, 'fastMode')
      ? FAST_TAP_MAX_SECONDS
      : TAP_MAX_SECONDS;
    if (this.grabSeconds <= tapWindow && this.travel <= TAP_MAX_TRAVEL) {
      this.startSession(entity);
    }
  }

  private startSession(entity: Entity): void {
    const index = entity.getValue(FocusSession, 'durationIndex') ?? 2;
    const seconds = entity.getValue(FocusSession, 'fastMode')
      ? FAST_SESSION_SECONDS
      : DURATIONS_MIN[index] * 60;
    entity.setValue(FocusSession, 'duration', seconds);
    entity.setValue(FocusSession, 'remaining', seconds);
    entity.setValue(FocusSession, 'outcome', SessionOutcome.None);
    entity.setValue(FocusSession, 'cardTime', 0);
    // Starting a session completes onboarding, whichever hint was showing.
    if ((entity.getValue(FocusSession, 'hintStep') ?? HINT_DONE) < HINT_DONE) {
      entity.setValue(FocusSession, 'hintStep', HINT_DONE);
      setOnboarded();
    }
    this.persistPrefs(entity);
    this.setPhase(entity, SessionPhase.FadingIn);
  }

  /** Ends a running session; `completed` false means it was cancelled. */
  private finish(entity: Entity, completed: boolean): void {
    if (completed) {
      const stats = recordCompletedSession();
      entity.setValue(FocusSession, 'sessions', stats.sessions);
      entity.setValue(FocusSession, 'streak', stats.streak);
    }
    entity.setValue(
      FocusSession,
      'outcome',
      completed ? SessionOutcome.Completed : SessionOutcome.Cancelled,
    );
    this.setPhase(entity, SessionPhase.FadingOut);
  }

  private setPhase(
    entity: Entity,
    phase: (typeof SessionPhase)[keyof typeof SessionPhase],
  ): void {
    entity.setValue(FocusSession, 'phase', phase);
    entity.setValue(FocusSession, 'phaseTime', 0);
  }

  private advance(entity: Entity, delta: number): void {
    const phase = entity.getValue(FocusSession, 'phase');
    if (phase === SessionPhase.Idle) {
      const card = entity.getValue(FocusSession, 'cardTime') ?? 0;
      if (card > 0) entity.setValue(FocusSession, 'cardTime', Math.max(0, card - delta));
      return;
    }
    if (this.blurred) return;
    const phaseTime = (entity.getValue(FocusSession, 'phaseTime') ?? 0) + delta;
    entity.setValue(FocusSession, 'phaseTime', phaseTime);

    if (phase === SessionPhase.FadingOut) {
      if (phaseTime >= FADE_SECONDS) this.endFadeOut(entity);
      return;
    }
    const remaining = (entity.getValue(FocusSession, 'remaining') ?? 0) - delta;
    entity.setValue(FocusSession, 'remaining', Math.max(0, remaining));
    if (remaining <= 0) {
      this.finish(entity, true);
    } else if (phase === SessionPhase.FadingIn && phaseTime >= FADE_SECONDS) {
      this.setPhase(entity, SessionPhase.Running);
    }
  }

  private endFadeOut(entity: Entity): void {
    this.setPhase(entity, SessionPhase.Idle);
    if (entity.getValue(FocusSession, 'outcome') === SessionOutcome.Completed) {
      entity.setValue(FocusSession, 'cardTime', CARD_SECONDS);
    }
  }

  /** Leaving XR mid-session resets to idle without counting the session. */
  private abortAll(): void {
    this.holding = false;
    for (const entity of this.queries.orbs.entities) {
      entity.setValue(FocusSession, 'remaining', 0);
      entity.setValue(FocusSession, 'outcome', SessionOutcome.None);
      this.setPhase(entity, SessionPhase.Idle);
    }
  }

  private setWorldPosition(entity: Entity, world: Vector3): void {
    const object = entity.object3D;
    if (object == null) return;
    this.local.copy(world);
    if (object.parent) {
      object.parent.updateWorldMatrix(true, false);
      object.parent.worldToLocal(this.local);
    }
    object.position.copy(this.local);
  }
}
