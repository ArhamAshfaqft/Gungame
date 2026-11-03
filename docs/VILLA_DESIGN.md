# Solstice villa: layout contract

The villa is one connected residence with public reception rooms, private suites,
service areas and an outdoor retreat. Props must support these room functions.
The floor plan is the source of truth; adding detail must preserve circulation.

## Building organization

| Level | Spaces | Purpose and circulation |
| --- | --- | --- |
| Basement | Garage workshop, wine vault, tasting cellar, laundry, mechanical room, communications, storage annex | Workshop and service functions; two stairs connect the floor to the residence. The wine rooms form a western loop and service rooms an eastern loop. |
| Main | Salon, dining, library, kitchen/pantry, gallery, winter garden, wellness pavilion | Reception floor. Salon opens to dining, dining connects to wellness and the courtyard. Library connects to kitchen through a public arch and a service bypass. The rear service landing connects the gallery and conservatory. |
| Upper | Primary suite, private study, guest suite, dressing lounge, spa, roof garden | Private floor. West and east room pairs connect through the central circulation and two stairs. Terraces provide alternate approaches with guarded edges. |

## Spatial rules

- Ordinary doors have 1.35–1.45 m openings, suited to this game's 0.9 m player
  collision diameter. Broad external entrances use paired leaves. Doors open
  away from the interacting player and collide in their own rotated frame.
- Central hall side walls are at ±2.7 m; the main stair opening is ±1.3 m.
  The service stair opening ends at x=12.55 m, leaving the outer circulation
  between that edge and the x=14 m facade.
- The pantry occupies the rear corner x=7.9–10.5, z=-11–-8. Its entrance faces
  the work aisle. No partition projects forward to the island.
- The island is narrower than the old block so the service side is a real aisle.
  Appliances remain accessible from the work aisle. Stools face the island.
- Every chair and sofa has an explicit authored focal point. Salon seating faces
  the coffee table and media wall; desks, chess seating and dining chairs face
  their associated work surfaces. Furniture directions are regression checked.
- Side exterior doors meet actual raised landings. Stair approaches join those
  landings at the stair crest, rather than leaving a gap beside the facade.
- Top-floor stairwell front edges are guarded. Descending uses the rear landing.
  Balcony and gallery roof rails include physical guard collision.
- Destruction can deliberately open a floor. Such breaches remain for the round;
  an intact floor must not contain accidental gaps.

## Verification

`tests/villa-circulation.test.js` checks that all 20 room regions connect to their
floor's circulation using a player-sized clearance grid, with doors treated as
open. This checks topology; it does not replace actual movement testing.

`artifacts/verify-villa-architecture.mjs` walks the actual player controller through
the kitchen/service aisle, pantry, wellness/courtyard loop and pool steps.
Doorway approaches, seating orientation, floor support and guards have separate
regression checks. The villa keeps impact marks for the round; the training
range retains its intentional rebuild behaviour.

Further dressing must follow the same rules: mount items to a supported surface,
keep doors and windows unobstructed, and place task objects where a person could
actually use them. Detailed assets and lighting remain an ongoing art task.

## Timber floor destruction

The authored timber breach bays and floor hatches use separate 35 mm finish
boards, 18 mm wood backing, 160 mm joists and a 12 mm plaster ceiling lining.
Oak finishes elsewhere can sit on concrete slabs; a wood texture alone does not
make the slab timber. Narrow board cells follow grain with staggered end breaks.
Weapon energy, angle and range control penetration through each actual layer.
Grouped impacts accumulate locally; a small penetrating hole does not erase an
entire board. Blasts transfer reduced pressure through the assembly and respect
the exposed surface's cover.

Intact joists remain visible and collidable inside a breach. Severing both
supports releases the affected strips; weakened one-ended boards can fail after
a short delay under player load, with a creak. Perimeter support remains.
Rugs clip to surviving finish boards. Tables and seating become compound rigid
bodies when damaged or unsupported, allowing them to tip, fall, collide and sleep.
This remains a bounded gameplay approximation, not a full structural engineering
simulation. Broken layers stay broken until the map resets. Oak finishes outside
the breach bays are separate 18 mm wood skins over concrete; damaging the skin
exposes the slab without creating a false opening through the slab.

`tests/timber-floor.test.js` verifies layers, grain layout, blast cover and support
failure. `tests/floor-fixtures.test.js` verifies furniture support loss and detail
attachment. `artifacts/verify-timber-floor.mjs` checks the rendered blast breach
and an actual player falling through the cleared floor assembly.

## Material parts and performance

`materialPart` assigns a physical material independently of the visual colour.
Thin wooden slats can be severed at the impact, retaining their anchored ends.
An exposed floor joist has a 95-point local bullet threshold: a close direct
sniper hit severs about 28 cm rather than deleting the full span. Its blast
threshold and the floor's board/backing/ceiling fracture settings remain as before.
Pistol impacts must group locally; range, angle and penetration losses still apply.

Marble uses the brittle stone profile: strong edge hits chip it, while a thick
centre needs more accumulated local damage. Concrete edge chipping and metal
denting retain their existing rules. Metal structure does not disappear.
Bottle bodies, necks and labels form one breakable glass object. Books are paper
parts that emit fluttering pages, with bound material surviving light hits.
Mattresses, pillows, curtains and upholstery emit fabric and filling with torn
surface marks. Chair legs are wooden parts; losing support changes the compound
chair's balance and moves its collision with the resulting fall. Cabinets have
real hollow interiors, shelves and independent doors. Books bind to shelf supports
and can fall, tumble and settle. See [the shared system](ENVIRONMENT_SYSTEM.md).

Damageable details remain in material batches, with cached world bounds for
ray rejection. Their static source transforms are frozen until detachment.
Only the affected source leaves the batch on impact or furniture motion.
Support queries use 2 m X/Z buckets and still test surviving triangles. Collision
changes invalidate the buckets. Persistent settled rubble sleeps until support
changes; at most 48 sleeping pieces per pool recheck support per update.
Paper, fabric, stuffing, sparks and dust use capped, temporary instanced pools.
Airborne temporary particles sample precise support at 120 ms intervals or after
moving 30 cm; retained rubble caches support for at most 50 ms or 12 cm of travel.
Contact is confirmed before settling. Sleeping rubble tracks its actual supporting
mesh so unrelated physics motion does not trigger all of its floor queries.
The map's visible dressing and persistent structural rubble are retained.

`tests/material-props.test.js` covers classifications, grouped thin-wood hits,
local joist severing, bottle clusters, paper/cloth particles, marble, metal,
chair support loss and sleeping rubble. `artifacts/verify-material-props.mjs`
uses actual gameplay weapon rays through the rendered prop batches.
`artifacts/profile-destruction.mjs` records intact, falling and resting CPU
update workloads separately; it is not a GPU/FPS benchmark.
