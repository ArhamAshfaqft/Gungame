# Single-player animation comparison

Open `/animation-preview.html`. The ordinary game at `/` is unchanged.
The preview has no room, transport or multiplayer imports and refuses to start
when `multiplayer=1` is present. Nothing in the game or network entry points
imports `src/animation-preview/PreviewAnimator.js`.

The existing version is preserved at branch
`codex/animation-baseline-a33b76e` (commit `a33b76e`). The current gameplay
animators, original clips, pose libraries and multiplayer protocol are not edited.

The left soldier uses the existing controller and saved primary/M4 pose
corrections. Select “Without pose corrections” to inspect the imported pose
before holding/weapon/peek adjustments. The right soldier uses a separate
experimental controller: continuous direction/speed weights, synchronized gait
phase, acceleration/deceleration blending and the existing stop/turn actions.
Both soldiers receive the same movement and use the same character and rifle.

Controls: automatic 54-combination comparison, pause, reset, slow playback, WASD,
Shift to sprint, X to toggle crouch, Q/E to hold left/right peek, arrows to turn,
mouse orbit and wheel zoom. Posture, peek, eight-direction movement and pace
selectors provide direct access to individual combinations. Blur clears held
keys; background time gaps are clamped. No pose is saved by this page.

The preview covers standing and crouched rifle idle/movement in all eight
directions, with no peek or either peek. The automatic sequence spends three
seconds on each of the 54 combinations. Crouched forward diagonals use supplied
clips; backward diagonals interpolate side/back clips because no dedicated
backward-diagonal source was supplied. Standing walking diagonals likewise blend
cardinal walk clips. Crouch and standing turns use their respective actions.
Peek is a smoothly weighted upper-body overlay applied after sampling, never
baked into the next pose. It does not alter the animated pelvis/feet.

Jumping, vaulting, firing/reloading and first-person animations remain separate
work. This page does not enable experimental movement inside the actual game.

Validation: `node --test tests/animation-preview.test.js` and
`node scripts/check-animation-preview.mjs` (Vite at port 5194).

`node scripts/check-animation-preview-directions.mjs` checks all 54 combinations and keyboard controls in Chrome.
