# Parity demo film — v7 transition revision

The scene source stays in `demo/v6/`; `record.cjs` now produces `parity-demo-v7.mp4`. The earlier v6 export remains separate. All displayed app records are synthetic.

```sh
npm run desktop:prepare
./node_modules/.bin/electron demo/v6/capture-stills.cjs
./node_modules/.bin/electron demo/v6/record.cjs
```

The storyboard is 18 seconds at 1920×1080, recorded at a 30 fps target to H.264 MP4 when supported. The reviewed v7 export measures 17.27 seconds (MediaRecorder uses capture timestamps). Generated scene clips live in the ignored `clips/` directory. They are optional; the renderer has a procedural fallback. The video exports stay out of Git.

## Screen handoff

- Sample only the first second of the existing AI push-in. Later frames deform interface text and occlude the screen with the stand.
- Track the monitor's four screen corners through that first second and project the actual schedule screenshot onto the screen.
- From 4.35 seconds, zoom the room and screen with the same transform. The interface stays attached to the bezel.
- Remove perspective only once the bezel is outside the viewport. Settle onto the exact full-screen app image at 5.5 seconds.
- Hold the app briefly, then animate that same image into the split-screen position from 5.85–6.75 seconds.

Review frames include 3.5, 4.0, 4.35, 4.7, 5.0, 5.34, 5.5, 5.85, 6.3, 6.75, 10.5 and 17.9 seconds. `window.prepare(t)` seeks clips; `window.renderAt(t)` composites each frame. If a replacement generated shot changes camera geometry, update `monitorTrack` from its actual frames before rendering.

## A new Higgsfield shot

Higgsfield is not connected in this Codex session. No fresh generation or credits were used for this revision. To regenerate after connection, use a clean lab start frame and a matching final monitor frame. Request a slow, continuous approach, stable monitor geometry, no stand or hand crossing the display, and a front-on final screen. Keep the UI as an exact composited app capture rather than relying on generated text.

Suggested shot prompt:

> Continue from the reference lab frame. One controlled dolly toward the desk monitor, with smooth easing and no cuts. Preserve the white robotics-style lab, yellow safety rails, instrument positions, monitor bezel and stand. Keep the monitor screen unobstructed. Finish straight-on, with the display filling the frame and all four screen edges aligned to the final reference. Do not invent interface text, widgets or a second display. No floating screen, morphing furniture, extra fingers, focus breathing or abrupt acceleration. The real interface is composited separately.

A generated camera shot can improve the room's motion; the final interface and timing should remain deterministic.
