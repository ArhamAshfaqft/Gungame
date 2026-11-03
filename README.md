# Fast Snipe

A browser-based, single-player sniper arena prototype built with Three.js.

## Run

Install dependencies with `npm install`, then use `npm run dev` and open the local URL Vite prints.
Use `npm run build` for the production build and `npm run preview` to preview it.
Run the movement and gunplay regression checks with `npm test`.

## Controls

- WASD / arrow keys: move
- Shift + forward: sprint
- C: crouch; from full sprint, a short low entry that ends crouched
- Space: short jump (no slide-jump acceleration)
- Q / E: lean (peek) left / right around cover
- Hold Alt: slow walk, with very light footsteps
- X: toggle crouch, silent and lower profile
- F: open / close the training-room door
- Left mouse: fire
- Hold right mouse: aim / scope
- R: reload
- 1 / 2: sniper rifle / M9 pistol
- 3 / 4 / 5: equip frag / flash / smoke in hand
- G: equip the last selected grenade (two of each per loadout)
- With grenade equipped: right mouse pulls the pin and starts a six-second fuse
- Left mouse: high throw; Alt + left mouse: low toss (right mouse again also low-tosses)
- 1 / 2 stows an unarmed grenade; live grenades must be thrown
- Escape: pause and release mouse

While the mouse is locked the game swallows Tab, Alt and Ctrl shortcuts, so browser focus changes (address bar, tab switching) cannot interrupt play.

The current mode uses seven respawning practice bots. It does not include multiplayer or enemy return fire.

## Weapons and equipment

### Adapted first-person actions

Nine selected wrist-motion clips from the user-supplied CS Metal build are adapted to the SWAT arms:
pistol and sniper draw/reload/fire plus grenade draw/pin/throw. The 52 KB animation-only file is
`public/assets/animations/view-actions.json`; it includes no source meshes, sounds, textures or game code.
The motion is sampled as bounded IK offsets and rotation deltas on top of saved grips, with blended
entry/exit. SWAT bone lengths and saved pose libraries are unchanged. Gameplay's existing reload, firing,
grenade release and fuse timings drive the adapted motion, rather than copying source gameplay timing.
The studio Action dropdown previews the firearm actions and grenade actions; first-person reloads
remain hand-motion adaptations, not physically articulated magazine/slide/bolt animations.

To regenerate, install UnityPy 1.25.x and run `python scripts/extract-view-actions.py`, followed by
`node scripts/prepare-view-actions.mjs`. The extractor reads the original bundle without executing it.
Original clip IDs and provenance are preserved in `view-actions.NOTICE.txt`; source animation authors
and redistribution terms remain unverified, and no CC0 license is asserted for these action curves.
The existing Mixamo full-body clips remain separate.

The M9 has a separate 15-round magazine and 45 reserve rounds, semi-automatic fire, and iron-sight aiming.
It deals 34 body damage or 100 head damage before penetration losses. Weapon switches take 280 ms and cancel
unfinished reloads. Both weapons use the same SWAT arms, with separate grip poses.

Grenades stay visible in hand when equipped, with a safety pin and a short pin-pull animation.
Right-click arms the grenade; the HUD counts down six seconds from that moment for all three types.
Inventory is consumed when the pin is pulled. Holding too long activates the grenade in your hand.
The remaining fuse carries over into flight without resetting. A trajectory guide previews the first
impact, with Alt switching the preview to a slower, lower toss. The guide stops at intact cover;
actual throws can break glass and continue through it. Safe grenades can be stowed; armed ones cannot.
The fuse pauses when the game is paused, like the rest of the training simulation.

Throws use swept collision against cover, bouncing, and timed fuses.
They can break and pass through windows. Frags deal distance-based damage
within six metres, and damage doors and glass. Opaque cover blocks blast damage. Your own explosions can
hurt you; being downed returns you to the range entrance and resupplies your loadout after 2.5 seconds.
Flashes use exposure based on distance, facing, and opaque cover. Exposed bots
pause briefly. Smoke builds up after activation and fades after 14 seconds; indoor clouds are
clipped to the training room. Smoke obscures sight but does not block bullets or blast damage.

Smoke uses 36 instanced puffs per cloud, with a maximum of three active clouds and six live projectiles.
No physics engine or large texture assets are added for these effects.
Grenade framing and hand poses are separate transient poses; equipping, cooking and throwing never
write to the saved sniper/pistol pose library or change firearm weapon placement.

## Tactical movement

The player starts facing the breaching room. Normal movement is 3.2 m/s, sprint is 7.2 m/s, quiet walk is
1.35 m/s, and crouch is 1.6 m/s. Aiming caps movement at 1.8 m/s; peeking caps it at 1.5 m/s.
Backward movement is slower, diagonal input cannot add speed, and stopping is responsive.

Sprinting lowers the rifle. Aiming, reloading or holding a lean key stops sprinting. Pressing fire during
sprint buffers one shot while the rifle raises for 220 ms; releasing the mouse lock cancels buffered fire.
The low-entry move spends existing momentum, has a cooldown, and ends crouched. Jumps are short, air steering
is limited, and arena launch pads have been removed. Crouching under a low ceiling prevents standing through it.

Q/E are hold-to-lean. A continuous head-volume sweep limits the lean against cover, and camera roll follows
the actual available clearance. Aimed/leaned movement has reduced head bob. The movement panel displays whether
the rifle is lowered, raising, ready, or in a peek/quiet stance. Aim sensitivity settings remain available.

## Training room

A concrete room sits on the practice range at the south end of the map. Its wooden door is built from
128 irregular fracture pieces and opens with **F**. Bullets leave real, ragged holes; later rounds can
travel through those holes. Enough heavy hits collapse the leaf and remove its movement collider.
The four windows break across their entire surface into triangular shards with a brief crack flash.
The same round continues through glass with 20% less damage, so targets behind a pane can be hit.
Intact glass blocks movement; shattered glass does not. The door and glass rebuild after 35 seconds.

Wood and glass fragments use fixed-size instanced pools (192 wood pieces, 256 shards), adding at most
two debris draw calls. Fragments bounce, settle and fade. Door damage and movement invalidate the
cached shadow map only while the prop changes.

The pause menu has hipfire and ADS sensitivity multipliers (0.20x–3.00x) plus inverted vertical aim.
They are saved to `localStorage` and applied live. Scoped look is normalised against the rendered FOV,
so 1.00x ADS moves the same number of pixels per mouse count as hipfire instead of feeling 4.7x faster.

## Pose Studio

Open `/studio.html` on the same game address, or use **Open Pose Studio** in the pause menu.
Choose a weapon and ready/aiming stance, then adjust weapon placement, hand targets, wrist rotations,
shoulder anchors, elbow directions, or the three curl joints on each finger. Positions use centimetres;
rotations use degrees. The preview uses the production SWAT arms, IK solver, weapon models, lighting,
and 62-degree viewmodel camera. **Inspect in 3D** adds orbit/pan/zoom and draggable target axes.
Reload and bolt actions can be previewed, but this version edits base poses rather than animation keyframes.

**Save to game** stores all four poses in this browser's local storage and updates game tabs on the same
origin (including the port). **Export JSON** backs up or shares the current library; **Import JSON** validates
and previews a library before saving. Exports can be supplied for inclusion as project defaults later;
saving locally does not rewrite source files or change other players' presets. Undo/redo, per-pose reset,
and copying offsets between stances are available. `Ctrl+S` saves; `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo outside fields.
The editor keeps bone lengths fixed; IK cannot reach targets beyond the arm's physical reach.
Hand-only rotation runs after IK and leaves the forearm and upper arm fixed. Separate shoulder and elbow
joint rotations use the skeleton hierarchy: rotating a parent carries its child joints and may move the
hand away from its IK target. Use the 3D joint selector for rotation rings or numeric XYZ controls.
The older coupled wrist control remains as **Grip orientation (arm follows)**. Existing saved poses and
export files keep their edits and receive zero offsets for the new independent joints.
Ready and aiming poses are separate: hold right mouse in game to see the saved aiming pose.
**Save grip to both stances** shares the selected weapon's hand/arm adjustments between ready and aiming,
while retaining separate weapon framing. The game refreshes saved poses on focus and resume as well as
storage events, so switching back from the studio applies saved changes.
Frag, flash and smoke are also available in the studio equipment dropdown. Each has four independent
presets: holding, pin pull, high throw and low toss. Pin-pull and throw presets are edited at their key
pose (mid pin pull / just before release) and blended into gameplay. The action preview loops these
movements, keeping the grenade visible so its grip can be inspected. All joint and finger controls,
save/load, undo and JSON export work for throwables. Older firearm-only libraries gain neutral throwable
presets automatically while retaining every firearm setting. Saving a throwable does not copy its poses
onto weapons or other grenade types.
Select **Grenade only** to position or rotate the grenade mesh without moving either hand or the arm rig.
Use **Arms + grenade group** for the overall first-person placement. Independent grenade offsets are saved
per throwable/action, blend during gameplay, and default to zero for older presets. Numeric XYZ controls
and move/rotate gizmos are available; exported libraries include these independent offsets.

## Visuals

### Mixamo animation pack

The supplied Basic Shooter Pack is converted to `public/assets/animations/shooter-pack.json`: sixteen
animation-only clips, approximately 887 KB total, shared by all full-body characters. The original ZIP
and 110 MB character are never loaded at runtime. `node scripts/prepare-shooter-pack.mjs` regenerates the
asset from `Basic Shooter Pack.zip` using the optimized SWAT skeleton as the target. It corrects local
bone orientations, removes horizontal hips translation, retains vertical motion, and optimizes keys.
The two slow strafe source filenames disagree with their measured movement direction, so runtime IDs
follow measured direction. Bone lengths and character world placement remain unchanged by animation.

Bots now blend between imported idle, walk/run, backward and directional strafe clips, with gait playback
scaled to movement speed. Surviving hits trigger the imported hit reaction before movement resumes.
Weapon orientation is calibrated against the imported aiming idle, follows the trigger hand, and uses
support-hand IK during locomotion. Existing procedural sliding and death behavior remain available;
the supplied pack has no dedicated slide or death animation. Practice bots still do not shoot back.

In the studio, **Full body** previews all sixteen clips on the real character, including firing, reload,
jump, turns and grenade toss. It has an orbit camera, timeline scrubbing, playback speed, loop control,
and a support-hand IK toggle. Equipment follows the hand for compatibility inspection. These are clip
preview controls. Full-body weapon placement now has separate saved position/rotation offsets per equipment,
with numeric controls and paused move/rotate gizmos. The offsets follow the animated hand across clips,
apply to live characters, and refresh on save/focus/resume. The trigger hand remains fixed; optional rifle
support-hand IK can follow the adjusted weapon. **Reset third-person placement** resets only that equipment's
body attachment. Undo/redo and JSON import/export include these offsets. Full-body joint correction editing
is limited to the rifle support hand: **Full body → Left hand & arm** edits its weapon-local IK target,
wrist rotation and finger curls. Keep support-hand IK enabled. A reset-to-fitted-grip button restores only
the support grip, leaving weapon and first-person placement unchanged. Fingers use a deterministic closed
wrap during supported rifle clips; reload/throw/hit clips release the hand. Saved grip corrections apply
to runtime characters and are included in exported libraries. Other full-body joint editing is not included.
Rifle and pistol catalogs are filtered
separately. **Full body → Right hand & arm** provides independent trigger-hand position, wrist rotation
and finger offsets for each equipment. The weapon is anchored before these corrections, so moving the
trigger hand does not move the gun. Right-hand settings save separately from support-hand and first-person
settings. Positions use weapon-local axes; rotations use the animated hand's local axes. Targets beyond
physical arm reach are reported instead of stretching the bones. Imported finger motion receives additive
offsets, sampled afresh each animation frame.

Movement and idle loops are preprocessed once into shared seamless cycles. Endpoint drift is distributed
across the original cycle and a small circular filter smooths the seam, preserving gait duration without
a compressed end blend. One-shot action clips retain their original timing. Locomotion changes match the
incoming leg pose to the current gait, crossfade over 200 ms, debounce noisy direction changes, and
ease playback-speed adjustments. The studio previews these same processed cycles (so displayed loop
durations match the raw FBX). Nearby bots animate every rendered frame out to
45 metres; distant poses update at 30 Hz. Saved hand/weapon presets and source animation files are
not rewritten by smoothing.
Both full-body hand controls are enabled for rifles, pistols and all three grenades. For pistol/grenade
left hands and released-hand rifle actions (reload, throw, hit), offsets are applied to the animated
hand anchor rather than a rifle support target. Move/rotate gizmos, finger controls, reset, save and
export work identically; editing either hand leaves the weapon and opposite hand fixed.
First-person gameplay keeps its existing saved poses
and action timing; imported body clips do not overwrite your first-person weapon/grenade library.

The separate `pistol-pack.json` adds twenty dedicated pistol clips (about 506 KB) from the supplied
Pistol/Handgun Locomotion Pack. Regenerate it with `node scripts/prepare-shooter-pack.mjs --pistol`.
It contains idle, forward/backward walk and run, strafes, diagonal arcs, jump variants, kneeling idle,
and stand/kneel transitions. The attachment uses a pistol-specific calibrated hand basis, separate
from the rifle grip. Two practice bots now carry pistols and select pistol locomotion based on their
actual movement. The controller also supports pistol jump and kneeling state transitions.
Studio equipment selection shows the matching twenty pistol clips, sixteen rifle-pack clips, or the
single imported grenade toss. The pistol pack has no firing, reload, draw or holster clip; those are
not silently substituted with rifle actions. Existing first-person actions remain procedural.

The weapon renders through a separate 62-degree camera, with dedicated lighting and environment reflections.
The world camera handles movement FOV and sniper zoom independently. The player arms and enemy bodies come from
the same user-provided Mixamo SWAT character. A shared rig controller poses the hands on the scoped rifle and
supports saved first-person grips, procedural actions, and imported full-body animation clips.
The current bot AI patrols on foot; the sprint/slide pose states can be driven by player or network movement state.

The original `Ch15_nonPBR.fbx` is kept untouched. `node scripts/prepare-swat.mjs` prepares the runtime asset while
the development server is available at `http://127.0.0.1:5180` (override with `ASSET_SERVER_URL`). This requires
the development dependencies and a Playwright Chromium browser. The export contains a 14,813-triangle remote body
and separate detailed arms with shared textures. Material groups are batched into two draws per body.
The preparation report is in `artifacts/swat-optimization.json`.

Static arena shadows are cached, high-DPI rendering is capped, and remote pose updates run at distance-based
intervals. First-person IK is recomputed only when a weapon action changes the grip.

Only the assets the game loads are committed: `swat.glb`, the M98B rifle and scope, the M9, and the eight arena textures.
The unused model packs, the source FBX and the build artifacts stay on disk but are excluded through `.gitignore`.

### Temporary combat audio

29 mapped effects from the user-provided CSMetal build are stored in `public/assets/audio/combat/`.
`manifest.json` records source names and asset IDs; `NOTICE.txt` records their unverified provenance.
These are user-requested local placeholders, not an assertion of an open-source audio license.
Replace cleared samples by keeping the same cue keys and regenerating `samples.json`.
`scripts/extract-game-audio.py` reads the source bundle without running it; `scripts/prepare-game-audio.py`
converts, trims and normalizes the selected cues. Recorded samples are preloaded after the Play gesture.
The PCM bank is carried in JSON for compatibility with browser environments that suppress media URLs.

The bank covers pistol/sniper shots, draws, dry fire, magazine removal/insertion, slide/bolt handling,
casings, scope, grenade pin/throw/bounce, frag/smoke, glass, door movement, impacts, hit feedback,
pain/death, landings and menu hover. Pin/throw are repurposed placeholders. Unsuitable/missing cues
(flash, sliding, jump, jump pads, wooden splinters) keep their procedural effects. The existing CC0
animation-contact footsteps are separate and unchanged. Weapon/reload voices use cancellable groups;
world impacts, grenade bounces/explosions and character reactions use distance/stereo attenuation.

### Third-person peek pose editing

Studio's **Edit third-person peeking** opens 40 independent presets: equipment × standing/crouched ×
left/right × ready/ADS. The editor adjusts automatic lean strength, individual torso/neck/head rotations,
weapon placement, independent hand IK targets, clavicles, upper arms, forearms, wrists, elbow poles and
finger joints. `peekPoses` is part of the existing version-1 pose library; older saves migrate with neutral
offsets. Save/export/import/undo include these presets without replacing first-person/reload data.

Gameplay samples ready/ADS offsets using ADS progress and weights them by cover-resolved lean.
Body edits rotate bones; they never translate or scale the spine. Hand target offsets use weapon axes,
joint rotations use local joint axes. Final joint rotations can intentionally move a hand off its IK target.
The same shared rig API accepts lean/ADS/posture state for future networked characters.

### Localized surface damage and skeletal deaths

`SurfaceDamage` adds material-specific, angle-oriented bullet marks (192 maximum, 75-second lifetime),
instanced concrete/wood/metal/glass debris and short dust bursts. Pistol/sniper impacts have distinct
radius, depth and debris budgets, scaled by weapon damage, range, incidence and prior penetration.
Concrete edge hits accumulate in nearby 12 cm face-local clusters (64 maximum per object). At close
range, three direct pistol hits in a cluster or one direct sniper hit reach the 100-point chip threshold;
distant or glancing hits need more. Successful cuts reset that cluster's strength. Pistol chips remain
smaller than sniper chips. Seeded irregular convex fracture volumes are subtracted from actual render
geometry. Flat concrete faces retain surface marks; damage on distant patches is not pooled. Wood loses chunks and breaks after accumulated damage; fully broken
wooden colliders are removed. Metal dents remain decals rather than unsupported arbitrary penetration.
The room's porch and interior bulbs are shootable, extinguishing only their linked point light.

This is localized destruction: concrete chips preserve the coarse player collision box, and large
structural walls do not collapse. Render cuts are capped per object; debris and marks are bounded.
Existing fractured wooden-door and glass-window logic is retained.

`SkeletalRagdoll` uses fixed-step Verlet particles, skeletal length/torso constraints and nearby static
box/ground contacts. A rigid torso cage, segment-length-based folding limits and nonadjacent particle
separation keep limbs from collapsing into the torso. Bone rotations are reconstructed from the captured
reference pose every frame, with normalized quaternions, rather than accumulating corrective twist.
Hit location/direction and weapon class affect the fall impulse. Limbs keep their
original bone translations and scales; weapons follow the hand. Settled bodies sleep and bots respawn
after five seconds. This lightweight constraint-based implementation is not a full rigid-body solver
with full hinge/cone joints, swept capsule contacts or body-to-body collision. It also runs for the local third-person body
on player death. Living hits apply a short localized skeletal kick in addition to the existing clip.

Non-ADS pistol crouch uses a lowered shoulder-chain carry before saved peek offsets. ADS carry and
all saved ADS peek data remain unchanged. Studio preview and gameplay share this same layer.

Bullet marks use surface-clipped decal triangles parented to their target. Geometry/index revisions
reproject surviving marks after door boards or wall fragments are removed; empty and degenerate
projections are discarded. Irregular chips use closed convex clipping with sloped interior caps,
limited to eight hits, 128 solid fragments and 50,000 vertices per object.



### Villa Solstice � flagship map foundation

The default game route now loads an original modern villa. Use `/?map=villa` for the residence or
`/?map=training` for the preserved arena and its rebuilding practice room. The pause/start menu
contains both map links. Studio saves continue to use the existing browser pose library.

The villa has three levels at 0, 3.4 and 6.8 metres: garage, wine cellar, utility and equipment rooms;
living room, dining room, library and kitchen; primary/guest bedrooms, study and bathroom/dressing.
Two internal staircase stacks connect every floor. A front stair, side approaches, balconies and
raised pool/pergola terrace provide exterior routes. Stairs have open slab undersides, collision and
swept grenade contacts; the floor slabs leave real stairwell openings. Spawn/respawn and bot locations
are map-specific. Bots use small local patrol radii; they do not yet navigate between floors.

`VillaPanel` provides hinged doors, shot-through glass, breachable plaster partitions and two wooden
floor hatches. It removes actual fracture triangles and corresponding cell collision. Intact panels
use one collision volume; damaged panels activate surviving cell bounds. Grenades can break glazing
and damage visible nearby panels. Debris uses a fixed 160-instance pool. Villa destruction persists
until the map is reloaded; the Training map keeps its automatic rebuilding behavior. Small concrete
edge chips, wooden props and shootable bulbs reuse the existing surface damage system.

Reinforced floor/roof slabs, structural piers and the concrete shell remain structural. This is a
playable first version of the launch-map foundation, not a finished competitive layout, networked
match mode, full structural-collapse simulation or final art pass. The pool is a shallow decorative
basin, with no swimming mechanic. Architectural details are batched by material, while breakable
panels remain individually editable/damageable.


### Solstice expanded interior / destruction pass

The villa now uses an asymmetric 19-space layout (`VillaInteriors.js`), including a sculpture gallery,
winter garden, basement storage annex and accessible roof garden. The three floors no longer repeat
the same four-room partition pattern. Gallery connections meet the rear stair landings. The main
floor connects salon/dining and library/kitchen with broad openings, while pantry, wine vault,
communications, mechanical, dressing and spa areas use smaller rooms and alternate door routes.
Training geometry and its reset behavior are preserved.

`VillaMaterials.js` supplies deterministic albedo, bump and roughness maps for oak, walnut, travertine,
marble, plaster, linen, carpet and service finishes. Interiors have their own wall palettes, built-in
cabinets, actual shelf boards and books, fittings, table settings, machinery and leaf-shaped planting.
Villa rendering adds screen-space ambient occlusion at reduced resolution and two cached interior
shadow fixtures. Only the nearest nine room point lights are active. Training keeps its original
render path. Furniture is code-authored. Broad plaster and oak surfaces use local 1K Poly Haven albedo, OpenGL
normal and roughness maps, with generated loading fallbacks. CC0 source links and checksums live in
`public/assets/textures/solstice/CREDITS.md` and `manifest.json`.

Full soft plaster wall sections (including selected facade infill) and over 70 square metres of timber
flooring are fracture panels. Reinforced slabs are physically cut around the timber areas; destroying
them creates real holes between levels. Grenades apply radial per-cell damage to visible panels,
rather than applying one hit to a panel centre. Rugs are projected onto supporting geometry and
reclipped as it breaks. Wood furnishings retain surface damage. Stone piers, most reinforced slabs
and retaining walls remain structural; the building does not undergo whole-structure collapse.

`VillaPanelBatch.js` renders static fracture panels by material and changes only the removed cell's
index range after damage. Raycasts still report the original panel and fracture cell. Structural
meshes and furniture share batches until first damage, at which point that individual source mesh
returns to ordinary rendering with its original collider and attached details. This preserves bullet
marks and concrete chips without issuing a separate draw for every intact object. Batched ray hits
also honour line-of-sight exclusions, so a panel cannot shield itself from the explosion targeting it.

Validation includes player movement through both staircase stacks and the annex entry, direct gunfire,
glass shattering, a grenade-created walk-through wall breach, falling through a destroyed timber floor,
carpet reprojection, material-batch hit mapping and neighbouring-panel isolation. Competitive balance,
network replication remain separate work.

### Shared material construction, support and water

`src/environment/` supplies reusable material profiles, hollow cabinets and
bookcases, layered countertops, support relationships, lazy rigid-body furniture
and loose objects, resting-object rebatching, and finite-volume water leaks.
Damaged chairs tip; unsupported books fall; metal mountings can detach when their
support is destroyed. Wood finish over concrete exposes the slab, while the
existing timber breach bays keep their layered appearance. Water reacts to hits,
drains from breached tubs and spreads in bounded puddles that respect obstacles
and floor openings. See `docs/ENVIRONMENT_SYSTEM.md` for map authoring, budgets,
approximations and verification, and `docs/VILLA_DESIGN.md` for circulation rules.
