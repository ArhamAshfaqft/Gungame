# Grenade aiming

Equip with 3/4/5 to preview before pulling the pin. The thick red arc is a high
throw; hold Alt to preview a slower blue low toss. Right-click pulls the pin.
Left-click throws (Alt + left-click for a low toss); right-click while armed
retains its existing immediate low-toss control.

The arc stops at the first surface hit, and the single red ring marks that first
drop. No bounce path or later resting position is drawn. Actual grenades retain
their normal bounces after landing. Distance and
throw mode appear in the weapon panel. `AIRBURST` means the fuse is predicted to
expire before the first contact. The estimate includes cooking time, the pin-pull
wait and the animation's release delay. It updates at most 30 times per second.
Walls occlude the guide: it is not an X-ray view of covered rooms.

`GrenadeFlight.js` uses the same 1/120-second steps for preview, local flight and
the authoritative host. Sweeps query the shared spatial buckets instead of
scanning the entire map for every predicted step. Previews account for glass
slowdown without shattering anything or playing sounds. Resting grenades wake if
destruction removes or moves their supporting surface. The release point is
offset toward the throwing hand and swept out from the eye to avoid spawning
through cover. Damage, fuse duration, throw speeds and player-only railing rules
remain in place.

The guide uses fixed line buffers, two screen-width line draws and small marker
meshes, without lights or physics bodies. It is excluded from SSAO and projectile
hit tests. The first-person spare hand stays extended after the pin pull; saved
firearm poses and the existing imported third-person throw are retained.

Verification: `tests/grenade-aim.test.js` compares flight across 30/60/144 Hz,
wall/floor bounces, cooked endpoints, glass, support removal and buffer reuse.
`node scripts/check-grenade-guide.mjs` captures high/low/cooked views and compares
a real stationary throw's first contact against the preview. The local Villa/stair
check matched the endpoint and recorded about 0.2 ms mean prediction time on the
test PC. This is not a guarantee for every device or aim position. Moving during
the release animation, network corrections, or geometry changing during flight
can change the outcome from the earlier prediction.
