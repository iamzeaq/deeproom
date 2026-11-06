import {
  createSystem,
  Entity,
  Quaternion,
  UIKitMLAsset,
  Vector3,
  Visibility,
} from '@iwsdk/core';
import { FocusOrb } from './orb-components.js';
import {
  AttachmentRole,
  DURATIONS_MIN,
  EnvChoice,
  FocusSession,
  OrbAttachment,
  SessionPhase,
} from './session-components.js';

const HINTS = ['Pinch to grab', 'Drag up/down to set time', 'Tap to begin'];

type TextElement = { setProperties(props: Record<string, unknown>): void };

interface PanelRef {
  nodeId: string;
  elementId: string;
  element: TextElement | null;
  last: string;
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Keeps orb-attached labels and controls beside the orb, turned toward the
 * user, and shows the right ones (with current text) for each session phase.
 */
export class SessionUISystem extends createSystem({
  orbs: { required: [FocusOrb, FocusSession] },
  attachments: { required: [OrbAttachment] },
}) {
  private orbPos = new Vector3();
  private headPos = new Vector3();
  private forward = new Vector3();
  private right = new Vector3();
  private target = new Vector3();
  private yaw = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);

  private timeText: PanelRef = { nodeId: 'time-label', elementId: 'time-text', element: null, last: '' };
  private remainingText: PanelRef = { nodeId: 'remaining-label', elementId: 'remaining-text', element: null, last: '' };
  private hintText: PanelRef = { nodeId: 'hint-label', elementId: 'hint-text', element: null, last: '' };
  private cardText: PanelRef = { nodeId: 'finish-card', elementId: 'card-text', element: null, last: '' };
  private muteOn: PanelRef = { nodeId: 'mute-icon', elementId: 'icon-on', element: null, last: '' };
  private muteOff: PanelRef = { nodeId: 'mute-icon', elementId: 'icon-off', element: null, last: '' };

  update(): void {
    const orb: Entity | undefined = this.queries.orbs.entities.values().next().value;
    const orbObject = orb?.object3D;
    if (orb == null || orbObject == null) return;

    orbObject.getWorldPosition(this.orbPos);
    this.player.head.getWorldPosition(this.headPos);
    this.forward.subVectors(this.headPos, this.orbPos);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, 1);
    this.forward.normalize();
    this.right.set(this.forward.z, 0, -this.forward.x);
    this.yaw.setFromAxisAngle(this.up, Math.atan2(this.forward.x, this.forward.z));

    const phase = orb.getValue(FocusSession, 'phase');
    const idle = phase === SessionPhase.Idle;
    const running = phase === SessionPhase.FadingIn || phase === SessionPhase.Running;
    const cardVisible = idle && (orb.getValue(FocusSession, 'cardTime') ?? 0) > 0;
    const hintStep = orb.getValue(FocusSession, 'hintStep') ?? 3;
    const envIndex = orb.getValue(FocusSession, 'envIndex') ?? 0;

    for (const entity of this.queries.attachments.entities) {
      const object = entity.object3D;
      if (object == null) continue;
      const offset = entity.getVectorView(OrbAttachment, 'offset');
      this.target
        .copy(this.orbPos)
        .addScaledVector(this.right, offset[0])
        .addScaledVector(this.up, offset[1])
        .addScaledVector(this.forward, offset[2]);
      if (object.parent) {
        object.parent.updateWorldMatrix(true, false);
        object.parent.worldToLocal(this.target);
      }
      object.position.copy(this.target);
      object.quaternion.copy(this.yaw);

      let visible = true;
      switch (entity.getValue(OrbAttachment, 'role')) {
        case AttachmentRole.TimeLabel:
          visible = idle;
          break;
        case AttachmentRole.Remaining:
          visible = running;
          break;
        case AttachmentRole.Hint:
          visible = idle && !cardVisible && hintStep < HINTS.length;
          break;
        case AttachmentRole.Card:
          visible = cardVisible;
          break;
        case AttachmentRole.EnvChoice: {
          visible = idle;
          const selected = entity.hasComponent(EnvChoice) &&
            entity.getValue(EnvChoice, 'envIndex') === envIndex;
          object.scale.setScalar(selected ? 1 : 0.7);
          break;
        }
        default:
          break;
      }
      if (!entity.hasComponent(Visibility)) {
        entity.addComponent(Visibility, { isVisible: visible });
      } else if (entity.getValue(Visibility, 'isVisible') !== visible) {
        entity.setValue(Visibility, 'isVisible', visible);
      }
    }

    const minutes = DURATIONS_MIN[orb.getValue(FocusSession, 'durationIndex') ?? 2];
    this.setText(this.timeText, `${minutes} min`);
    if (running) {
      this.setText(this.remainingText, formatClock(orb.getValue(FocusSession, 'remaining') ?? 0));
    }
    if (hintStep < HINTS.length) this.setText(this.hintText, HINTS[hintStep]);
    if (cardVisible) {
      const streak = orb.getValue(FocusSession, 'streak') ?? 1;
      this.setText(this.cardText, `+1 session · ${streak}-day streak`);
    }
    const muted = orb.getValue(FocusSession, 'muted') ? 'muted' : 'on';
    this.setDisplay(this.muteOn, muted === 'on');
    this.setDisplay(this.muteOff, muted === 'muted');
  }

  private resolve(ref: PanelRef): TextElement | null {
    if (ref.element) return ref.element;
    const panel = this.world.getSceneObject<UIKitMLAsset>(ref.nodeId);
    const element = panel?.getElementById(ref.elementId) as TextElement | undefined;
    if (element) {
      (element as unknown as { name: string }).name = ref.elementId;
      ref.element = element;
    }
    return ref.element;
  }

  private setText(ref: PanelRef, text: string): void {
    if (ref.last === text) return;
    const element = this.resolve(ref);
    if (element == null) return;
    element.setProperties({ text });
    ref.last = text;
  }

  private setDisplay(ref: PanelRef, shown: boolean): void {
    const value = shown ? 'flex' : 'none';
    if (ref.last === value) return;
    const element = this.resolve(ref);
    if (element == null) return;
    element.setProperties({ display: value });
    ref.last = value;
  }
}
