# Shared material and environment system

The villa uses reusable material, construction, support and liquid systems in
`src/environment/`. New maps supply their geometry and attachment definitions;
they do not need a new set of damage formulas. Material properties use calibrated
gameplay budgets, not laboratory ballistic or building-engineering measurements.

## Layers and responsibilities

| Module | Responsibility |
| --- | --- |
| `MaterialCatalog.js` | Physical material profiles and default visual-material mappings. |
| `ConstructionPrefabs.js` | Hollow cabinet and bookcase construction, separate shelves/doors, stone countertops over timber backing. |
| `EnvironmentSystem.js` | Support relationships, lazy Cannon rigid bodies, collision adapters, attachments, sleep and rebatching. |
| `PartBatching.js` | Static/resting material batches with individual source hit testing and safe detachment. |
| `MotionBatch.js` | Multi-draw of moving loose objects and their marks, with original source ray hits. |
| `ShapeCulling.js`, `PhysicsBox.js` | Cached shape bounds and analytical box projections for the existing collision shapes. |
| `RaycastCache.js`, `WorldRayQuery.js` | Indirect geometry BVHs and shared world bounds for repeated explosion/support rays. |
| `ShadowCache.js` | Full-quality shadow invalidation for lights whose frusta intersect old/new motion bounds. |
| `LiquidSystem.js` | Water impacts, finite container volume, breach leaks and bounded surface puddle flow. |
| `world/PhysicalMaterials.js` | Projectile energy loss, incidence/thickness penetration, blast attenuation. |
| `world/SurfaceDamage.js` | Shared weapon-hit dispatch, local stress, fracture, marks and material particles. |

## Authoring a new map

The map adapter supplies `scene`, `colliders`, `rubbleFloor(point, ceiling)` and
optionally `panels`, `floorFixtures`, `surfaceDamage`, `propBatches` and
`shadowsDirty`. Support is determined from actual remaining triangles; there are
no villa floor heights in the shared modules. Primitive prefab builders also use
the map's `box(...)` factory and material palette.

1. Instantiate `EnvironmentSystem(map)` before building objects.
2. Tag each physical part with `materialPart(mesh, 'wood', options)`. Visual colour
   alone is insufficient: a white mattress is cloth; a white bath shell is ceramic.
3. Give structural parts a collider with `box.supportMesh = mesh`. Marking a part
   shootable and giving it player collision are separate choices.
4. Build real layers and interiors. Use a hollow cabinet rather than a solid
   coloured box; use veneer over concrete where that is the intended construction.
5. Register rigid assemblies and their dependencies. A chair's remaining pieces
   form one compound body; books are separate loose objects supported by shelves.
6. Call `environment.observeScene()` after all geometry and dependencies exist,
   then batch the static parts. Update environment and liquids each simulation tick.

Example relationships:

```js
materialPart(shelf, 'wood', { thickness: 0.022 });
map.environment.support(shelf, [
  { mesh: leftSide, anchor: leftLocalFixingPoint },
  { mesh: rightSide, anchor: rightLocalFixingPoint },
], { supportMode: 'all' });

materialPart(book, 'paper', { looseItem: true, supportOwner: shelf });
map.environment.support(book, [shelf], { loose: true });
```

Anchors are in the supporting mesh's local coordinates. They test surviving
convex material or panel triangles, so a fixing inside a hole does not count as
support. `any` allows alternative fixings; `all` releases a part when either
essential fixing is lost. `anchored` explicitly preserves structural foundations.
`wallMount` preserves undamaged wall attachments. Wall cabinets can supply local
`wallMountProbe` points which bind to nearby structural supports during observation.

Call `removeProp` for complete removal and `syncDamagedCollision` after geometry
changes. These keep collision and support caches current. Route weapon impacts
through `SurfaceDamage.hit`; existing panel hits keep their specialized fracture
path. Do not mutate geometry without invalidating its support relationships.

## Material behaviour

- **Wood:** localized accumulated stress, thickness and grain-aware chips,
  oblique severing of narrow timber, tapered penetrating channels, released boards
  and load-bearing assemblies. Floors retain their existing layered breach design.
  A bearing furniture leg that is cut breaks off whole: the leg falls into the shared
  debris pool and the chair loses that support instead of balancing on a stump.
- **Stone, concrete and ceramic:** brittle/local fracture with material and
  thickness resistance. Thin stone worktops can fracture through their centres;
  dense slabs remain much tougher. A stone stair skin reacts over a stable ramp.
- **Metal:** dents, marks and sparks. Metal does not fracture away; a metal frame
  can fall if its wall attachments fail. A detached door remains hinged to a
  falling frame and retains collision openings from its broken cells.
- **Glass:** clustered bottle body/neck/label shatter together. Loose ceramic or
  glass objects can also shatter on a sufficiently hard rigid-body collision.
- **Paper and cloth:** torn marks, fluttering pages, fabric and stuffing. Bound
  books retain material under light hits and fall when their shelves lose support.

The catalogue is shared; geometry still matters. The engine cannot infer an
unknown model's thickness, joints, contents or construction from its texture.

## Water

Register a horizontal water mesh with `liquids.add(mesh, {bottom, walls, floor})`.
`walls` are the actual container meshes; `bottom` is the watertight base and
`floor` is the intended spill-floor height. Optional `area` overrides the water
surface area for nonrectangular basins. Provide a matching water area to gameplay
for wading/buoyancy; the water surface itself is shootable but never a solid floor.

Impacts produce wave displacement, expanding ripples, drops and a water-impact
sound. A breached shell creates a sampled opening and a curved outflow. Discharge
reduces the finite contained volume and stops at the breach sill. Surface cells
retain that volume, flow around real obstacles and descend through floor breaches.
This is a bounded surface-flow approximation, not a volumetric fluid simulation.

## Budgets and persistence

- At most 96 awake assembly/loose-object bodies; additional activations queue.
  Cannon uses a fixed 60 Hz step with at most 80 ms accumulated per update.
- Static physics obstacles are gathered near awake bodies rather than simulating
  the entire furnished map. Moving colliders do not rebuild static physics each tick.
- Sleep and rebatching remove lasting work from settled objects. A small pose-based
  rest check suppresses solver micro-jitter; hits and contact impulses wake objects.
- Loose props stay in moving GPU material batches while active or asleep. Their
  geometry, UVs, transforms and marks remain individual. Marks retain their draw
  order and shadow settings and do not participate in weapon collision. A hit
  detaches the affected source safely before geometry changes.
- Bounding-box culling rejects separated compound shapes before detailed contact
  tests. Box SAT uses its exact support function rather than iterating eight
  corners on every axis. Cannon's friction-patch averaging avoids redundant corner
  friction equations; normal contacts, bodies, solver iterations and tick rate stay.
- Support scans follow structural changes and activations, rather than every
  moving collider. Nearby static-physics bucket queries are shared by all bodies.
- Geometry ray trees preserve original face/index ordering (`indirect: true`)
  and rebuild after edits. Snapshot world bounds filter explosion rays before
  triangle queries. Both paths retain original hit meshes and fracture-cell IDs.
- Structural edits invalidate all shadow maps. Motion invalidates only light
  shadow frusta intersecting the union of old/new caster bounds. Shadow resolution,
  rendering quality and update rate for affected lights are unchanged.
- Retained structural rubble uses a 1,024-instance pool. It follows its exact
  supporting mesh and rechecks when that support changes, rather than on unrelated
  furniture movement. Retained airborne support probes cache for at most 50 ms or
  12 cm of travel and confirm contact before settling.
- Water has 768 puddle cells, 160 drops and 48 impact rings. Flow runs at 10 Hz;
  bounded wet-cell checks detect new floor openings. When the cell budget fills,
  spill volume is merged into existing cells rather than silently deleted.
- Paper, cloth, stuffing, glass, sparks and dust use bounded temporary pools.
  Major rubble and damage remain until a map reset; cosmetic particles expire.

## Validation

`tests/environment-system.test.js` covers independent cabinet construction,
shelf/book consequences, sleep/wake, metal attachment failure, stone backing,
falling doors with collision holes, debris support ownership, water-volume
conservation, breach sill limits, obstacle blocking and floor-hole drainage.

The browser scripts `verify-environment-systems.mjs`, `verify-material-props.mjs`,
`verify-timber-floor.mjs` and `verify-villa-layout-review.mjs` exercise the actual
game and save review screenshots under `artifacts/`. `profile-destruction.mjs`
measures CPU update work separately for intact, falling and settled scenes; its
headless results are not an FPS or GPU benchmark.

`tests/environment-performance.test.js` checks moving-source/mark batching,
growth/removal, weapon ray mapping, numerical box-projection equivalence, contact
equivalence for shape culling, BVH invalidation, finite-range blast ray equivalence
and shadow-frustum invalidation. `profile-study-bookshelf.mjs` reproduces a close
blast at the 5 m private-study bookcase, including 125 authored books.

The recorded before/after study workload changed from 963 moving-frame render
calls to 356 (including relevant shadow passes), and 899 later calls to 294.
The initial two-second CPU-update sample fell from about 2,236 ms to 1,347 ms;
95th-percentile update time fell from 24.2 ms to 14.3 ms. These are controlled
headless workload measurements, not a promised hardware FPS. Every original
source remains; the simulation still uses the same 60 Hz step and awake-body cap.
