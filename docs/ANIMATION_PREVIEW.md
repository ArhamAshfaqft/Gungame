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

Controls: automatic 24-second comparison, pause, reset, slow playback, WASD,
Shift to sprint, arrows to turn, mouse orbit and wheel zoom. Blur clears held
keys; background time gaps are clamped. No pose is saved by this page.

This first pass deliberately covers standing rifle locomotion only. It does not
claim finished foot planting, starts, crouch/lean combinations, jumps or vaults.
Those need separate visual comparison before they can be enabled in gameplay.

Validation: `node --test tests/animation-preview.test.js` and
`node scripts/check-animation-preview.mjs` (Vite at port 5194).
