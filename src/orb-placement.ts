import {
  createSystem,
  Entity,
  Grabbed,
  Quaternion,
  Vector3,
  VisibilityState,
  XRAnchor,
  XRPlane,
} from '@iwsdk/core';
import { FocusOrb } from './orb-components.js';

/** Minimal view of a WebXR XRPlane; lib.dom does not ship these types. */
interface DetectedPlane {
  orientation?: string;
  polygon: ReadonlyArray<{ x: number; z: number }>;
}

/** Orb may snap to a surface at most this far below its center (meters). */
const MAX_SNAP_HEIGHT = 0.35;
/** Tolerate the orb center dipping slightly through a surface. */
const MIN_SNAP_HEIGHT = -0.05;
/** Frames to wait after entering XR so the tracked head pose is valid. */
const SPAWN_DELAY_FRAMES = 3;

function pointInPolygon(
  x: number,
  z: number,
  polygon: ReadonlyArray<{ x: number; z: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Spawns the focus orb in front of the seated user when an XR session starts,
 * and on release snaps it onto a detected horizontal plane (table) if one lies
 * just below it, anchoring it to the real world. Otherwise the orb stays where
 * it was released.
 */
export class OrbPlacementSystem extends createSystem({
  orbs: { required: [FocusOrb] },
  held: { required: [FocusOrb, Grabbed] },
  planes: { required: [XRPlane] },
}) {
  private headPos = new Vector3();
  private headQuat = new Quaternion();
  private forward = new Vector3();
  private worldPos = new Vector3();
  private local = new Vector3();
  private up = new Vector3();
  private spawnFrames = -1;
  private settling: Entity | null = null;
  private settleY = 0;

  init(): void {
    let wasImmersive = false;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const immersive = state !== VisibilityState.NonImmersive;
        if (immersive && !wasImmersive) this.spawnFrames = SPAWN_DELAY_FRAMES;
        wasImmersive = immersive;
      }),
      this.queries.held.subscribe('qualify', (entity) => {
        if (this.settling === entity) this.settling = null;
        entity.setValue(FocusOrb, 'onSurface', false);
      }),
      this.queries.held.subscribe('disqualify', (entity) => {
        if (entity.active) this.snapToSurface(entity);
      }),
    );
  }

  update(delta: number): void {
    if (this.spawnFrames >= 0 && this.spawnFrames-- === 0) {
      for (const entity of this.queries.orbs.entities) this.spawnInFront(entity);
    }

    const entity = this.settling;
    if (entity === null) return;
    const object = entity.object3D;
    if (!entity.active || object == null) {
      this.settling = null;
      return;
    }
    object.getWorldPosition(this.worldPos);
    const diff = this.settleY - this.worldPos.y;
    if (Math.abs(diff) < 0.0005) {
      this.worldPos.y = this.settleY;
      this.settling = null;
    } else {
      this.worldPos.y += diff * Math.min(1, delta * 18);
    }
    this.setWorldPosition(entity, this.worldPos);
  }

  private spawnInFront(entity: Entity): void {
    if (entity.hasComponent(Grabbed)) return;
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.headPos);
    head.getWorldQuaternion(this.headQuat);
    this.forward.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-4) this.forward.set(0, 0, -1);
    this.forward.normalize();

    const distance = entity.getValue(FocusOrb, 'spawnDistance') ?? 0.5;
    const drop = entity.getValue(FocusOrb, 'spawnDrop') ?? 0.4;
    this.worldPos
      .copy(this.headPos)
      .addScaledVector(this.forward, distance);
    this.worldPos.y = Math.max(0.5, this.headPos.y - drop);
    this.settling = null;
    entity.setValue(FocusOrb, 'onSurface', false);
    this.setWorldPosition(entity, this.worldPos);
  }

  private snapToSurface(entity: Entity): void {
    const object = entity.object3D;
    if (object == null) return;
    object.getWorldPosition(this.worldPos);
    const radius = entity.getValue(FocusOrb, 'radius') ?? 0.06;

    let bestSurfaceY = -Infinity;
    for (const planeEntity of this.queries.planes.entities) {
      const plane = planeEntity.getValue(XRPlane, '_plane') as
        | DetectedPlane
        | undefined;
      const planeObject = planeEntity.object3D;
      if (!plane || planeObject == null || plane.orientation !== 'horizontal') {
        continue;
      }
      planeObject.updateWorldMatrix(true, false);
      // Plane-local +Y is the surface normal; skip ceilings (facing down).
      this.up.set(0, 1, 0).transformDirection(planeObject.matrixWorld);
      if (this.up.y < 0.9) continue;
      this.local.copy(this.worldPos);
      planeObject.worldToLocal(this.local);
      if (this.local.y < MIN_SNAP_HEIGHT || this.local.y > MAX_SNAP_HEIGHT) {
        continue;
      }
      if (!pointInPolygon(this.local.x, this.local.z, plane.polygon)) continue;
      const surfaceY = this.worldPos.y - this.local.y * this.up.y;
      if (surfaceY > bestSurfaceY) bestSurfaceY = surfaceY;
    }

    if (bestSurfaceY === -Infinity) return; // Fallback: stay where released.

    this.settleY = bestSurfaceY + radius;
    this.settling = entity;
    entity.setValue(FocusOrb, 'onSurface', true);
    if (!entity.hasComponent(XRAnchor)) entity.addComponent(XRAnchor);
  }

  private setWorldPosition(entity: Entity, worldPos: Vector3): void {
    const object = entity.object3D;
    if (object == null) return;
    this.local.copy(worldPos);
    const parent = object.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(this.local);
    }
    object.position.copy(this.local);
  }
}
