import { createComponent, Types } from '@iwsdk/core';

/** Marks the Deeproom focus orb. Systems read the radius for surface snapping. */
export const FocusOrb = createComponent('FocusOrb', {
  radius: { type: Types.Float32, default: 0.06, min: 0.01, max: 0.5 },
  /** Distance in front of the viewer when the orb spawns on session start. */
  spawnDistance: { type: Types.Float32, default: 0.5, min: 0.2, max: 2 },
  /** How far below eye level the orb spawns (roughly desk height when seated). */
  spawnDrop: { type: Types.Float32, default: 0.4, min: 0, max: 1.5 },
  /** True while the orb rests on a detected horizontal plane. */
  onSurface: { type: Types.Boolean, default: false },
});
