import {
  createSystem,
  Entity,
  Vector3,
  VisibilityState,
  XRPlane,
} from '@iwsdk/core';
import { isDemoMode } from './dev-flags.js';
import { FocusOrb } from './orb-components.js';
import { OrbPlacementSystem } from './orb-placement.js';
import { FocusSession, SessionPhase } from './session-components.js';
import { SessionSystem } from './session-system.js';

/** Minimal view of a WebXR XRPlane; lib.dom does not ship these types. */
interface DetectedPlane {
  orientation?: string;
  polygon: ReadonlyArray<{ x: number; z: number }>;
}

type Stage =
  | 'waitXR'
  | 'spawn'
  | 'move'
  | 'settle'
  | 'dial'
  | 'start'
  | 'session'
  | 'card'
  | 'flick'
  | 'rest';

/** Duration index the demo dials up to (25 min). */
const DEMO_DURATION_INDEX = 2;
const SPAWN_HOLD = 1.4;
const MOVE_SECONDS = 1.8;
/** Orb is released this far above the table, then settles onto it. */
const MOVE_ABOVE_TABLE = 0.08;
const SETTLE_HOLD = 1;
const DIAL_STEP_SECONDS = 0.8;
/** Seconds into the second session before the orb is flicked away. */
const FLICK_AFTER = 5;
const FLICK_SECONDS = 0.22;
const FLICK_DISTANCE = 0.45;
const REST_SECONDS = 1.5;
/** Table heights (world Y, meters) considered when choosing a surface. */
const TABLE_MIN_Y = 0.35;
const TABLE_MAX_Y = 1.2;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * `?demo=1` autoplay: drives Deeproom's whole loop with no input, repeating
 * two rounds forever. Round one picks environment 1, dials to 25 min, runs a
 * 10 s session to the chime and streak card. Round two picks environment 2
 * and flick-cancels the session part way through. Inactive without the flag.
 */
export class DemoSystem extends createSystem({
  orbs: { required: [FocusOrb, FocusSession] },
  planes: { required: [XRPlane] },
}) {
  private enabled = false;
  private stage: Stage = 'waitXR';
  private t = 0;
  private round = 0;
  private dialSteps = 0;
  private immersive = false;
  private launchTimer = 0;
  private placement: OrbPlacementSystem | undefined;
  private session: SessionSystem | undefined;
  private from = new Vector3();
  private to = new Vector3();
  private rest = new Vector3();
  private pos = new Vector3();
  private head = new Vector3();
  private local = new Vector3();
  private normal = new Vector3();
  private centroid = new Vector3();

  init(): void {
    this.enabled = isDemoMode();
    if (!this.enabled) return;
    this.placement = this.world.getSystem(OrbPlacementSystem);
    this.session = this.world.getSystem(SessionSystem);
    const launch = () => {
      if (!this.immersive) this.world.launchXR();
    };
    // Fallback for real browsers that require a user gesture to enter XR.
    window.addEventListener('pointerdown', launch);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', launch),
      this.world.visibilityState.subscribe((state) => {
        this.immersive = state !== VisibilityState.NonImmersive;
        if (!this.immersive) this.go('waitXR');
      }),
    );
  }

  update(delta: number): void {
    if (!this.enabled) return;
    const orb: Entity | undefined = this.queries.orbs.entities.values().next().value;
    if (orb == null || orb.object3D == null) return;
    this.t += delta;

    switch (this.stage) {
      case 'waitXR':
        if (!this.immersive) {
          // Emulated XR (IWER) accepts a session without a gesture; retry
          // every few seconds until the runtime is ready.
          this.launchTimer -= delta;
          if (this.launchTimer <= 0) {
            this.launchTimer = 3;
            this.world.launchXR();
          }
        } else if (this.t > 1) {
          this.go('spawn');
        }
        break;

      case 'spawn':
        if (this.t === delta) {
          orb.setValue(FocusSession, 'envIndex', this.round);
          orb.setValue(FocusSession, 'durationIndex', 0);
          orb.setValue(FocusSession, 'cardTime', 0);
          this.placement?.spawnInFront(orb);
        }
        if (this.t >= SPAWN_HOLD) {
          orb.object3D.getWorldPosition(this.from);
          this.findTableTarget(this.to);
          this.go('move');
        }
        break;

      case 'move': {
        const k = easeInOut(Math.min(1, this.t / MOVE_SECONDS));
        this.pos.lerpVectors(this.from, this.to, k);
        this.pos.y += Math.sin(Math.PI * k) * 0.06; // gentle carry arc
        this.setWorldPosition(orb, this.pos);
        if (k >= 1) {
          this.placement?.snapToSurface(orb);
          this.go('settle');
        }
        break;
      }

      case 'settle':
        if (this.t >= SETTLE_HOLD) {
          this.dialSteps = 0;
          this.go('dial');
        }
        break;

      case 'dial':
        if (this.t >= DIAL_STEP_SECONDS) {
          this.t = 0;
          const index = orb.getValue(FocusSession, 'durationIndex') ?? 0;
          if (index < DEMO_DURATION_INDEX) {
            orb.setValue(FocusSession, 'durationIndex', index + 1);
          } else {
            this.go('start');
          }
        }
        break;

      case 'start':
        orb.object3D.getWorldPosition(this.rest);
        this.session?.startSession(orb);
        this.go('session');
        break;

      case 'session': {
        const phase = orb.getValue(FocusSession, 'phase');
        if (this.round === 1 && this.t >= FLICK_AFTER &&
          (phase === SessionPhase.FadingIn || phase === SessionPhase.Running)) {
          this.player.head.getWorldPosition(this.head);
          // Throw sideways and away from the viewer.
          this.from.copy(this.rest);
          this.to.subVectors(this.rest, this.head).setY(0).normalize();
          this.to.set(this.to.x - this.to.z, 0.35, this.to.z + this.to.x).normalize();
          this.to.multiplyScalar(FLICK_DISTANCE).add(this.rest);
          this.go('flick');
        } else if (phase === SessionPhase.Idle && this.t > 1) {
          this.go(this.round === 0 ? 'card' : 'rest');
        }
        break;
      }

      case 'flick': {
        const k = Math.min(1, this.t / FLICK_SECONDS);
        this.pos.lerpVectors(this.from, this.to, k * (2 - k));
        this.setWorldPosition(orb, this.pos);
        if (k >= 1) {
          this.session?.cancelByFlick(orb, this.rest);
          this.go('session');
        }
        break;
      }

      case 'card':
        if ((orb.getValue(FocusSession, 'cardTime') ?? 0) <= 0) this.nextRound();
        break;

      case 'rest':
        if (this.t >= REST_SECONDS) this.nextRound();
        break;
    }
  }

  private go(stage: Stage): void {
    this.stage = stage;
    this.t = 0;
    console.info(`[deeproom demo] round ${this.round + 1}: ${stage}`);
  }

  private nextRound(): void {
    this.round = (this.round + 1) % 2;
    this.go('spawn');
  }

  /**
   * Picks the up-facing detected plane at table height nearest the viewer and
   * returns a point just above its centre. Falls back to a spot ahead of and
   * below the orb when no plane qualifies.
   */
  private findTableTarget(out: Vector3): void {
    this.player.head.getWorldPosition(this.head);
    let best = Infinity;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as DetectedPlane | undefined;
      const object = entity.object3D;
      if (!plane || object == null || plane.orientation !== 'horizontal') continue;
      if (plane.polygon.length === 0) continue;
      object.updateWorldMatrix(true, false);
      this.normal.set(0, 1, 0).transformDirection(object.matrixWorld);
      if (this.normal.y < 0.9) continue;
      let x = 0;
      let z = 0;
      for (const p of plane.polygon) {
        x += p.x;
        z += p.z;
      }
      this.local.set(x / plane.polygon.length, 0, z / plane.polygon.length);
      this.centroid.copy(this.local);
      object.localToWorld(this.centroid);
      if (this.centroid.y < TABLE_MIN_Y || this.centroid.y > TABLE_MAX_Y) continue;
      const dx = this.centroid.x - this.head.x;
      const dz = this.centroid.z - this.head.z;
      const distance = dx * dx + dz * dz;
      if (distance < best) {
        best = distance;
        out.copy(this.centroid);
      }
    }
    if (best === Infinity) {
      out.copy(this.from);
      out.y -= 0.15;
      return;
    }
    out.y += MOVE_ABOVE_TABLE;
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
