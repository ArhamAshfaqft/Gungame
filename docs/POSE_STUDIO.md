# Pose Studio authoring

Open `/studio.html`. Selection and saving are separate: changing the weapon, action or state does not overwrite another selection.

## Play, freeze and correct the real movement

Click **Play & capture pose** above the viewport. This opens the actual training game inside Studio, using its movement controller and full-body animation pipeline. Click the game's start button to capture the mouse.

Use WASD, Shift, X, Q/E, right mouse, left mouse, R and Space exactly as in the game. Number keys select weapons and grenades. Bots do not attack in this test session. This mode inspects the full-body character; ordinary first-person authoring remains available outside live mode.

Press **P** at the problem moment. The character and simulation freeze, the mouse is released, and Studio automatically selects the gun, actual animation clip, playback time, posture, peek direction and Ready/Fire/ADS state. The captured context is displayed above the game. Drag inside the frozen view to orbit, right-drag to pan, and scroll to zoom. Use the editor sliders alongside it; they update the same frozen character without accumulating corrections.

**Whole pose / state** saves an adjustment to the selected animation/state or exact standing/crouched left/right peek preset. **Keyframe at frozen moment** creates a key at the captured clip time; peek keys remain separate by weapon, posture, direction and state. Choose this scope before freezing, or change it while frozen. Whole-pose corrections shift existing keys by the same change; they are not hidden by a key at the captured moment.

Use **Resume controls** or P to resume and test. Press P to release the mouse before using **Back to preview**. Your unsaved edits remain available for testing; use a save button to persist them.

**Save to game** persists in the current browser. **Save to project**, available on the local development server, also writes `public/assets/poses/studio-library.json`. Previous file versions are backed up under `.pose-backups/`. The asset is included in builds and supplies defaults for browsers without a local pose library; an existing browser library takes priority. Export JSON remains available for backups and hosted builds where the local project-writing endpoint is unavailable.

## Select what you are editing

1. Choose a weapon.
2. Choose **Ready / no firing**, **Fire without ADS**, or **ADS / aiming or firing**. ADS and firing through the sight share the third state.
3. Choose **First person** or **Full body**. These have independent presets. The optional “Use full-body pose in first person” setting still explicitly links that weapon's views.
4. Select an animation/action. **Selected animation only** saves edits to that clip and state. **Default for all animations** provides a fallback within the current view; more specific edits take priority.

First-person actions include idle, walk, sprint, crouch, left/right peek, crouched left/right peek, draw, reload, firing and bolt. Full-body choices come from the loaded animation pack for that equipment. The game selects a full-body clip from movement/posture; select the matching clip to edit it, or use the all-animation default.

## Adjust a pose

- Weapon placement controls move and rotate the gun. For a new full-body preset, “Trigger hand follows weapon placement” keeps its anchor with the moved gun; turn it off to edit the two independently.
- Either hand exposes target position, grip orientation, shoulder anchor, elbow direction, upper-arm rotation, forearm rotation, wrist-only rotation, thumb rotation and each finger's three joints.
- **Body, head & legs** exposes each full-body joint's position and rotation.
- Turn support-hand IK or crouched-peek arm assistance off for a preset to inspect/edit the original animation.
- Raw joint rotations move child joints. A large shoulder or elbow rotation can move a hand off its target. Palm markers can be used to enforce a selected contact after manual arm edits. IK cannot reach targets beyond the arm's length.

## Standing and crouched peeks

Choose **Edit third-person peeking**, then posture and left/right direction. The main weapon-state selector remains enabled and controls the peek state too. There is no second competing ADS selector.

Peek presets have separate weapon, body/head/leg, shoulder, arm, wrist, thumb and finger adjustments for each weapon, posture, side and state. Peek controls add adjustments over the selected full-body animation preset. **Automatic lean strength** can be set to zero if you want to author the lean yourself. Switch back to normal grip editing to change the underlying clip/timeline.

## Animate with keyframes

Expand **Animate with keyframes**. Pause or scrub the timeline, or enter a playhead time. Choose **Add / update keyframe at playhead**, then edit the controls for that selected keyframe. Select **Base pose** to edit the starting pose/default instead.

Playback interpolates positions, joint rotations, hand targets and finger settings between keys. The base pose acts as the initial key at zero unless you add a key there. Values hold after the last key. Full-body key times are seconds inside the original clip, so keep keys within its duration. First-person reload key times correspond to the weapon's reload duration. For precise magazine, ammunition and sound events, the existing advanced M9 reload timeline remains available.

These timelines animate offsets over the existing motions; they do not create a new imported FBX/GLB skeleton clip or replace gameplay reload timing.

## Copy and save

Expand **Copy to another gun or state**, choose the destination weapon, animation and state, then copy the pose and keys. Copying creates independent data. Adjust the target gun's grips, stock position and sight alignment afterward. Rifles are the most suitable starting points for other rifles; different weapon families need different base motions.

**Copy ALL edited animations** copies matching edited presets, full-body defaults and peek presets from the source weapon to the target. Matching target presets are replaced; unrelated presets remain. Undo can reverse the copy before or after saving in the current Studio session.

Use **Save to game** to persist and sync edits, and **Export JSON** for a portable backup. Earlier libraries migrate without discarding existing hip/ADS, hand-marker or reload data. The original local-storage payload is also preserved once under `fast-snipe-poses-before-studio-upgrade-v1`.

In game, press **P** to freeze a pose and inspect it from different camera angles. Press **P** again to resume.
