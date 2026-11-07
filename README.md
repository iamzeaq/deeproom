# Deeproom

A hands-first mixed-reality focus timer for Meta Quest 3, built on IWSDK.
Seated use, no controllers required.

## The loop

1. Enter XR. A glowing orb appears about 50 cm in front of you at desk height,
   in passthrough.
2. **Pinch to grab** the orb and place it. Released a little above a detected
   table, it settles onto the surface and is anchored there; otherwise it stays
   where you let go.
3. **Drag up/down** while pinching to pick 5 / 15 / 25 / 45 min. Pinch one of
   the two small orbs beside it to choose an environment; pinch the speaker
   token to mute.
4. **Tap** (a quick pinch) the orb to begin. Over 3 s the 360 environment and
   its ambient loop fade in; the orb slowly shrinks and pulses, with the time
   left shown underneath.
5. When time is up: a chime, a 3 s fade back to passthrough, and a
   "+1 session · N-day streak" card.
6. **Flick** (throw) the orb during a session to cancel. Nothing is counted.

First-run hints walk through grab, drag, and tap once. Streak, session count,
and your duration/environment/mute choices are stored in `localStorage`.

## Develop

```sh
npm install
npm run dev
```

Open the app with `?fast=1` (dev server only) to make every session 10 seconds
long, so the whole loop can be tested or filmed quickly. Fast mode also accepts
slow taps (up to 3 s) for laggy emulators and screen recorders.

Open with `?demo=1` to auto-play the whole loop with no input: the orb spawns,
moves onto the table, dials to 25 min and runs a 10 s session in the first
environment (chime, fade back, streak card), then repeats in the second
environment with a flick-cancel, forever. Combine with `?emulate=1` to run it in
the IWER emulator on any host, including the production build
(`/?emulate=1&demo=1`). Demo mode never writes to localStorage. On a real
headset, tap once to enter XR; browsers may also block audio until a tap.

## Assets to replace

Placeholders, keep the file names when dropping in CC0 assets:

| File | Placeholder |
| --- | --- |
| `public/environments/env1.jpg`, `env2.jpg` | 1024x512 generated gradient skies (equirectangular) |
| `public/audio/ambient1.mp3`, `ambient2.mp3` | 8 s generated loops, **WAV data under an .mp3 name** (Chromium detects the format from content) |
| `public/audio/chime.mp3` | starter chime |

Equirectangular images (2:1) of 2048x1024 or smaller keep memory low on Quest.

## Code map

- `src/session-system.ts`: pinch gestures (tap, time dial, flick) and the session state machine
- `src/demo-system.ts`: `?demo=1` autoplay that drives the full loop with no input
- `src/immersion.ts`: environment fade, ambient/chime audio, mute, orb shrink and pulse
- `src/session-ui.ts`: orb-attached labels and controls, facing the user
- `src/orb-placement.ts`: spawn in front of the user, table snap and anchoring
- `src/storage.ts`: streak/prefs/onboarding persistence (all access try/catch)
- `src/release-tracker.ts`: hand-speed tracking for flick detection
- `src/session-components.ts`, `src/orb-components.ts`: ECS components
- `src/scene-assets/`: procedural orb, picker orbs, mute token, environment sphere
- `public/scenes/main.iwsdk.scene.json`, `public/ui/*.uikitml`: composition and labels
