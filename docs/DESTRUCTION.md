# Material-based destruction

Shared tuning lives in `src/world/PhysicalMaterials.js`. These are gameplay
approximations, not engineering data. Change material rules here rather than
adding weapon-specific exceptions to individual rooms.

- `physicalMaterial`: wood, plaster, concrete, metal or glass.
- `thickness`: metres along the impact direction; panels declare it explicitly.
  Ordinary props derive it from their geometry and world scale.
- `fracture`: local damage needed to detach a fragment, with construction
  modifiers for doors, timber floors and partitions.
- `penetrationPerMetre` and `retention`: projectile energy cost and the amount
  of damage retained after passing through a surface. Oblique impacts traverse
  more material. Energy falls with travel distance and after each penetration.
- `blastScale` and `blastReach`: susceptibility and falloff of exposed surfaces.
  Blast visibility is captured before anything breaks, so a newly opened hole
  does not allow the same explosion to destroy the next partition.

Puncturing material and detaching a large fragment are separate operations.
Sniper rounds can pass through ordinary wood without deleting an entire cell.
Penetrating panel hits cut a small tapered channel through both faces, with a
wider splintered exit. Punctured panels leave their static render batch so the
old opaque geometry cannot cover the hole; subsequent cell fractures still work.
Grouped nonpenetrating wood hits form progressively deeper blind craters before
detaching a cell. Untouched cell triangulations are cached during rebuilds.
Repeated hits at the same spot reuse a surface mark instead of stacking decals.
Energy carried through multiple layers is reduced by each material and by the
distance between layers; it is not regenerated from the weapon at each surface.
Pistol hits accumulate within roughly 10 cm impact patches; widely scattered
hits cannot contribute to one shared hole. Existing weapon spread determines
the actual impact points. A pellet energy profile exists for future shotguns;
this change does not add a selectable shotgun.

Near-wall floor-level frag blasts break weak skins locally. Exposed framing
remains separately shootable. More distant exposed surfaces receive cracks and
scorch staining; neither staining nor explosions automatically starts a fire.
Concrete chips and metal dents retain structural collision. Thin sheet metal
deforms more than thick steel. Decals reproject when their supporting mesh changes.

Persistent rubble has a bounded instance budget. Support queries use surviving
triangles, not the empty volume inside an object's enclosing box. Piece height
comes from its shape, and settled pieces check support every quarter second.
Moving a door or removing a supporting surface wakes the affected rubble.

Verification: `tests/physical-materials.test.js`, `tests/villa-map.test.js`,
`tests/persistent-debris.test.js`, and `tests/surface-damage.test.js`.
