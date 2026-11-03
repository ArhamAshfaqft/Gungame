# Destruction scheduling

The villa keeps its authored objects, visible fracture shapes, materials, debris
pools, audio and saved weapon poses. Performance work must include rendering,
physics settling and gameplay reactions, not just the explosion function's return
time. The first worker implementation did not adequately validate those cases.

## Execution

- Two module workers warm up while the villa loads. A blast copies only the
  nearby geometry needed for exposure tests, including the original index order,
  draw ranges, material sides and assembly identifiers. Rendering buffers are
  never transferred or detached.
- All blast exposure is evaluated against one snapshot taken before damage.
  A hole opened by an explosion cannot expose a second room to that same blast.
- Thin brittle containers can declare a local interior using `brittleContainer`.
  A detonation inside that volume applies a gameplay pressure-retention factor;
  a close outside detonation can shatter its exposed wall, while distance,
  thickness, incidence and pre-blast cover limit the other sides. Lower pressure
  makes smaller fractures, never a new bullet decal. This is an authored material
  response, not an engineering pressure-vessel simulation.
- A shattered shell emits at most twelve broad fragments per part into the
  existing instanced rubble pool. Its collider is removed and the existing water
  leak system drains into bounded puddles. No new fragment bodies, materials,
  shader variants or larger particle pools are introduced by that response.
- Geometry cuts, rail severing, penetration channels, metal dents, surface marks,
  blast stains and carpet reprojection use the original geometry routines in a
  worker. Full UVs, normals and vertex colours return with the replacement mesh.
- Worker messages batch up to 16 independent operations. New blast plans and
  structural cuts have priority over cosmetic surface marks.
- Scene changes, collision updates and body activation run in a queue with a
  soft 3 ms budget per frame. An indivisible update or browser garbage collection
  can exceed that budget. Workers never mutate the live scene.
- Hits on each mesh remain ordered. A new bullet synchronously finishes pending
  damage on that mesh before penetration is calculated. Late worker replies are
  ignored; geometry revisions prevent overwriting a newer hole or restoring a
  destroyed object.
- Unsupported worker environments retain synchronous destruction. Worker failures
  fall back to the same local operations. `map.destruction.whenIdle()` is available
  for deterministic integration checks; normal gameplay does not wait for it.

## Recovery of gameplay and full-frame performance

- A changed mesh no longer automatically becomes a free rigid body. Doors retain
  intact frame attachments; a punctured bookcase back does not release every shelf
  and book. Actual loss of an attachment or bearing support still causes a fall.
- Structural hits notify direct dependants immediately, before cosmetic marks
  finish. The complex-body impulse budget does not leave loose books or failed
  supports waiting motionless in the air.
- Each loose book has one rigid collision box while retaining its visibly chipped
  mesh and accurate projectile raycasts. Loose-object contacts use zero restitution
  and a more stable contact relaxation; objects still collide, settle, sleep and
  wake on new impacts.
- Supported contact groups sleep together once their poses and speeds have stayed
  quiet. Low-energy loose-object contacts dissipate rolling motion instead of
  endlessly waking neighbours. Airborne objects and energetic impacts keep moving;
  removing a recorded bearing surface wakes the affected resting objects.
- Automatic collision wakes use actual contact impact speed for loose objects.
  Cannon's raw angular-speed wake rule could let a small rotating book wake a
  settled pile repeatedly. Direct impacts and support changes still wake objects;
  a falling-object integration test verifies collision waking.
- Overlapping CSG bounding boxes are partitioned and joined into the same occupied
  collision volume with no overlaps. This preserves the existing collision openings
  while eliminating duplicate mass and redundant contacts in furniture.
- The loading screen prepares normal, batched and instanced destruction shaders,
  including coloured particles, SSAO and water streams. It uses the same linear HDR
  targets as gameplay. Warming only canvas shaders does not avoid first-use stalls
  inside the compositor. Material textures finish loading before warm-up.
- Geometry changes invalidate the relevant shadow regions, with the original map
  resolutions retained. Cosmetic marks do not trigger every light's shadow map.
- Water-flow barrier caches follow structural revisions, so a moving book no
  longer invalidates every cached wall/floor connection.

The physics step remains 60 Hz. The contact solver now uses 20 iterations to
resolve deep piles more reliably. Book count, fragment pools, retained rubble and
shadow resolution remain. This is game-scale material simulation, not an
engineering fracture or fluid simulation.

## Verification

`npm test` includes exact synchronous/worker geometry comparisons, complete villa
exposure comparisons at the study, kitchen and wooden floor, carpet clipping,
pending-hit collision updates, stale replies, batched results and cancellation.

Browser checks:

```powershell
node artifacts/benchmark-explosion-entry.mjs
node artifacts/verify-destruction-workers.mjs
node artifacts/verify-bookshelf-performance.mjs
node artifacts/verify-timber-floor.mjs
node artifacts/verify-villa-production.mjs
node artifacts/verify-studio-environment-smoke.mjs
node artifacts/verify-recovery.mjs
node artifacts/profile-recovery.mjs final
```

The comparison benchmark uses fresh scenes, warmed audio and identical blast
positions for both implementations. It also asserts identical damage values,
removed parts, broken panel cells and mark counts. Results are saved in
`artifacts/explosion-worker-comparison.json`. These are local main-thread CPU
measurements, not a promise of a particular FPS on every device. Heavy scenes
still depend on GPU speed, browser scheduling and the cost of active physics;
under load, background geometry and cosmetic updates can finish over later frames.

Matched local comparison (2026-11-03; warmed audio, headless Chromium):

| Location | Synchronous blast processing | Worker blast submission | Largest commit batch |
| --- | ---: | ---: | ---: |
| Study bookshelf | 129.1 ms | 12.2 ms | 3.5 ms |
| Kitchen island | 115.5 ms | 10.8 ms | 4.5 ms |

Both runs produced identical damage values, part visibility, broken panel cells,
and mark counts. There were no worker fallbacks or worker errors in either run.

That earlier table measured submission time only and did **not** establish smooth
gameplay. The later complete-sequence profiles (`recovery-before.json` and
`recovery-final.json`) include rendering during damage and one simulated minute
of aftermath. In these local runs:

| Measurement | Before recovery | After recovery |
| --- | ---: | ---: |
| Study pile awake bodies after one minute | 33 | 0 |
| Study physics collision shapes after blast | 585 | 130 |
| Kitchen physics collision shapes | 182 | 52 |
| Largest washroom render call | 775.7 ms | 4.5 ms |

The final study, washroom and kitchen runs all had zero awake bodies at the end
of that minute, no worker errors, and no measured graphics compilation calls above
3 ms during the blast. Damage was committed over multiple rendering frames;
submission time is not the total damage-completion time. Controlled manual-step
checks wait for pointer lock to be acquired and released before simulation, so the
game loop cannot advance physics a second time during those measurements.

Browser integration also checks actual gun raycasts into a rack, a still-operable
breached door, timber finish over concrete, a three-layer floor breach, immediate
chair collapse and three concurrent blasts. All these checks must pass alongside
the physics and geometry tests. Rendering measurements use headless Chromium with
software graphics and are evidence of removed stalls, not a universal FPS guarantee.
