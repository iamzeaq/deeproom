import {
  AssetManager,
  AudioSource,
  AudioUtils,
  createSystem,
  Entity,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  Visibility,
} from '@iwsdk/core';
import { FocusOrb } from './orb-components.js';
import {
  AmbientAudio,
  ChimeAudio,
  EnvironmentSphere,
  FocusSession,
  SessionOutcome,
  SessionPhase,
} from './session-components.js';
import { FADE_SECONDS } from './session-system.js';

type Phase = (typeof SessionPhase)[keyof typeof SessionPhase];

const ENV_TEXTURE_IDS = ['env1', 'env2'] as const;
const PULSE_PERIOD = 4;
const MIN_SCALE = 0.55;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function setVisible(entity: Entity, visible: boolean): void {
  if (!entity.hasComponent(Visibility)) {
    entity.addComponent(Visibility, { isVisible: visible });
  } else if (entity.getValue(Visibility, 'isVisible') !== visible) {
    entity.setValue(Visibility, 'isVisible', visible);
  }
}

/**
 * Presents a focus session: fades the 360 environment sphere over passthrough,
 * fades ambient audio in and out, plays the completion chime, honours mute,
 * and makes the orb slowly shrink and pulse as time runs down.
 */
export class ImmersionSystem extends createSystem({
  orbs: { required: [FocusOrb, FocusSession] },
  spheres: { required: [EnvironmentSphere] },
  ambients: { required: [AmbientAudio, AudioSource] },
  chimes: { required: [ChimeAudio, AudioSource] },
}) {
  private textures: (Texture | null)[] = [null, null];
  private sphereMaterial: MeshBasicMaterial | null = null;
  private coreMaterial: MeshStandardMaterial | null = null;
  private baseEmissive = 1;
  private baseVolumes = new Map<Entity, number>();
  private prevPhase: Phase = SessionPhase.Idle;
  private appliedMuted: boolean | null = null;
  private opacity = 0;
  private fadeFrom = 0;
  private elapsed = 0;
  private headPos = new Vector3();

  init(): void {
    ENV_TEXTURE_IDS.forEach((id, index) => {
      AssetManager.loadTextureById(id)
        .then((texture) => {
          texture.colorSpace = SRGBColorSpace;
          this.textures[index] = texture;
        })
        .catch((error: unknown) => {
          console.warn(`[deeproom] environment texture ${id} failed`, error);
        });
    });
  }

  update(delta: number): void {
    this.elapsed += delta;
    const orb: Entity | undefined = this.queries.orbs.entities.values().next().value;
    if (orb == null) return;
    const phase = orb.getValue(FocusSession, 'phase') as Phase;
    const phaseTime = orb.getValue(FocusSession, 'phaseTime') ?? 0;

    if (phase !== this.prevPhase) {
      this.onTransition(orb, this.prevPhase, phase);
      this.prevPhase = phase;
    }
    this.applyMute(orb.getValue(FocusSession, 'muted') ?? false);

    switch (phase) {
      case SessionPhase.FadingIn:
        this.opacity = clamp01(phaseTime / FADE_SECONDS);
        break;
      case SessionPhase.Running:
        this.opacity = 1;
        break;
      case SessionPhase.FadingOut:
        this.opacity = this.fadeFrom * (1 - clamp01(phaseTime / FADE_SECONDS));
        break;
      default:
        this.opacity = 0;
    }
    this.updateSphere();
    this.updateOrb(orb, phase, delta);
  }

  private onTransition(orb: Entity, from: Phase, to: Phase): void {
    const envIndex = orb.getValue(FocusSession, 'envIndex') ?? 0;
    if (to === SessionPhase.FadingIn) {
      const material = this.resolveSphereMaterial();
      if (material) {
        material.map = this.textures[envIndex];
        material.needsUpdate = true;
      }
      for (const entity of this.queries.ambients.entities) {
        if (entity.getValue(AmbientAudio, 'envIndex') === envIndex) {
          AudioUtils.play(entity, FADE_SECONDS);
        }
      }
    } else if (to === SessionPhase.FadingOut) {
      this.fadeFrom = this.opacity;
      for (const entity of this.queries.ambients.entities) {
        if (AudioUtils.isPlaying(entity)) AudioUtils.pause(entity, FADE_SECONDS);
      }
      const completed =
        orb.getValue(FocusSession, 'outcome') === SessionOutcome.Completed;
      if (completed && !orb.getValue(FocusSession, 'muted')) {
        for (const entity of this.queries.chimes.entities) AudioUtils.play(entity);
      }
    } else if (to === SessionPhase.Idle && from !== SessionPhase.FadingOut) {
      // Aborted (e.g. left XR): drop audio immediately.
      for (const entity of this.queries.ambients.entities) AudioUtils.stop(entity);
    }
  }

  private applyMute(muted: boolean): void {
    if (this.appliedMuted === muted) return;
    const apply = (entity: Entity) => {
      if (!this.baseVolumes.has(entity)) {
        this.baseVolumes.set(entity, entity.getValue(AudioSource, 'volume') ?? 1);
      }
      AudioUtils.setVolume(entity, muted ? 0 : (this.baseVolumes.get(entity) ?? 1));
    };
    for (const entity of this.queries.ambients.entities) apply(entity);
    for (const entity of this.queries.chimes.entities) apply(entity);
    if (this.queries.ambients.entities.size > 0) this.appliedMuted = muted;
  }

  private resolveSphereMaterial(): MeshBasicMaterial | null {
    if (this.sphereMaterial) return this.sphereMaterial;
    const sphere: Entity | undefined = this.queries.spheres.entities.values().next().value;
    const object = sphere?.object3D;
    if (object == null) return null;
    object.traverse((child) => {
      if (this.sphereMaterial == null && child instanceof Mesh &&
        child.material instanceof MeshBasicMaterial) {
        this.sphereMaterial = child.material.clone();
        child.material = this.sphereMaterial;
      }
    });
    return this.sphereMaterial;
  }

  private updateSphere(): void {
    const sphere: Entity | undefined = this.queries.spheres.entities.values().next().value;
    const object = sphere?.object3D;
    const material = this.resolveSphereMaterial();
    if (sphere == null || object == null || material == null) return;
    const visible = this.opacity > 0.001;
    setVisible(sphere, visible);
    if (!visible) return;
    material.opacity = this.opacity;
    this.player.head.getWorldPosition(this.headPos);
    if (object.parent) {
      object.parent.updateWorldMatrix(true, false);
      object.parent.worldToLocal(this.headPos);
    }
    object.position.copy(this.headPos);
  }

  private updateOrb(orb: Entity, phase: Phase, delta: number): void {
    const object = orb.object3D;
    if (object == null) return;
    if (this.coreMaterial == null) {
      const core = object.getObjectByName('Core');
      if (core instanceof Mesh && core.material instanceof MeshStandardMaterial) {
        this.coreMaterial = core.material.clone();
        this.baseEmissive = this.coreMaterial.emissiveIntensity;
        core.material = this.coreMaterial;
      }
    }
    const active = phase === SessionPhase.FadingIn || phase === SessionPhase.Running;
    const wave = Math.sin((2 * Math.PI * this.elapsed) / PULSE_PERIOD);
    let scale = 1;
    if (active) {
      const duration = orb.getValue(FocusSession, 'duration') ?? 1;
      const remaining = orb.getValue(FocusSession, 'remaining') ?? 0;
      const fraction = duration > 0 ? clamp01(remaining / duration) : 0;
      scale = (MIN_SCALE + (1 - MIN_SCALE) * fraction) * (1 + 0.035 * wave);
    }
    // Ease toward the target so the end-of-session return to full size is soft.
    const current = object.scale.x;
    const next = active ? scale : current + (1 - current) * Math.min(1, delta * 1.5);
    object.scale.setScalar(next);
    if (this.coreMaterial) {
      this.coreMaterial.emissiveIntensity = active
        ? this.baseEmissive * (0.85 + 0.2 * (wave + 1))
        : this.baseEmissive;
    }
  }
}
