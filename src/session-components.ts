import { createComponent, Types } from '@iwsdk/core';

/** Focus durations the orb dial cycles through, in minutes. */
export const DURATIONS_MIN = [5, 15, 25, 45] as const;

export const SessionPhase = {
  Idle: 'idle',
  FadingIn: 'fadingIn',
  Running: 'running',
  FadingOut: 'fadingOut',
} as const;

export const SessionOutcome = {
  None: 'none',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;

/** Focus-session state, stored on the orb entity. */
export const FocusSession = createComponent('FocusSession', {
  phase: { type: Types.Enum, enum: SessionPhase, default: SessionPhase.Idle },
  outcome: {
    type: Types.Enum,
    enum: SessionOutcome,
    default: SessionOutcome.None,
  },
  durationIndex: { type: Types.Int8, default: 2, min: 0, max: 3 },
  /** Total seconds of the running session. */
  duration: { type: Types.Float32, default: 0 },
  /** Seconds left in the running session. */
  remaining: { type: Types.Float32, default: 0 },
  /** Seconds spent in the current phase. */
  phaseTime: { type: Types.Float32, default: 0 },
  envIndex: { type: Types.Int8, default: 0, min: 0, max: 1 },
  muted: { type: Types.Boolean, default: false },
  /** Sessions last 10 seconds (set from the ?fast=1 URL flag). */
  fastMode: { type: Types.Boolean, default: false },
  /** Onboarding hint shown: 0 grab, 1 drag, 2 tap, 3 done. */
  hintStep: { type: Types.Int8, default: 3, min: 0, max: 3 },
  /** Seconds the finish card stays visible. */
  cardTime: { type: Types.Float32, default: 0 },
  sessions: { type: Types.Int32, default: 0 },
  streak: { type: Types.Int32, default: 0 },
});

export const AttachmentRole = {
  TimeLabel: 'timeLabel',
  Remaining: 'remaining',
  Hint: 'hint',
  Card: 'card',
  Mute: 'mute',
  EnvChoice: 'envChoice',
} as const;

/** Keeps an entity at `offset` from the orb in a frame that faces the user. */
export const OrbAttachment = createComponent('OrbAttachment', {
  role: {
    type: Types.Enum,
    enum: AttachmentRole,
    default: AttachmentRole.TimeLabel,
  },
  /** Right / up / toward-user offset from the orb center, in meters. */
  offset: { type: Types.Vec3, default: [0, 0.1, 0] },
});

/** A small orb that selects environment `envIndex` when pinched. */
export const EnvChoice = createComponent('EnvChoice', {
  envIndex: { type: Types.Int8, default: 0, min: 0, max: 1 },
});

/** A pinchable token that toggles audio mute. */
export const MuteToggle = createComponent('MuteToggle', {});

/** The 360 environment sphere that replaces passthrough during a session. */
export const EnvironmentSphere = createComponent('EnvironmentSphere', {});

/** Ambient loop for environment `envIndex`. */
export const AmbientAudio = createComponent('AmbientAudio', {
  envIndex: { type: Types.Int8, default: 0, min: 0, max: 1 },
});

/** Chime played when a session completes. */
export const ChimeAudio = createComponent('ChimeAudio', {});
