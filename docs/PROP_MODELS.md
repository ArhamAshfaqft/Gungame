# Villa prop detail pass

Furniture uses continuous-grain oak and walnut veneers rather than parquet textures.
Tabletops have clipped/rounded edges. Storage has panel gaps, recessed bases and pulls.
Bedside lamps have shaped bases, stems and tapered shades, without new light sources.
Cups have open bowls and handles; plates have raised rims. Books have separate cover
surfaces and page blocks. Desktop models have stands, keycaps and a static display.
Plant pots have tapered rims and soil; leaf geometry has fewer segments plus vein textures.

Component details stay in the original mesh, retaining damage metadata, ownership and
support relationships. Batches retain vertex colours. Existing box-based fracture entry
paths remain enabled on remodelled box props; the existing fracture system approximates
these objects by their box bounds when cutting them. Cut faces inherit the base tint.
No additional physics bodies, animated foliage, dynamic screen updates or lights.

## Verification

- Full test suite, build, and two-browser villa initial world/rig synchronization.
- Specific tests for coloured batching, independently detachable parts, cup opening,
  paper/ceramic damage metadata, and a real through-hole in remodelled storage.
- Visual inspection: private study, primary suite, dining room and study plant.

## Performance sample

Headless Chrome, 1440 x 900, fixed High quality, same camera positions, single-player.
These are local RAF measurements, not a guarantee of displayed FPS on other PCs.

| View | Before mean ms | After mean ms | Before draws | After draws |
| --- | ---: | ---: | ---: | ---: |
| Study | 3.477 | 3.626 | 239 | 245 |
| Suite | 4.647 | 4.802 | 710 | 724 |
| Dining | 3.419 | 3.657 | 229 | 237 |
| Plant | 3.073 | 3.231 | 171 | 173 |

This pass adds a small measured cost, not zero overhead. Hidden geometry was removed
from book covers, cabinet corners and ceramics to keep the increase bounded.
