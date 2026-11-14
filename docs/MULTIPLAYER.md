# Private multiplayer alpha

No Colyseus Cloud account, subscription, payment card or paid server is needed.
One PC runs a Node.js authoritative server; all players use a browser. The host
also joins as an ordinary browser client. The first version supports one private
room with up to four players, two automatically assigned teams, friendly-fire
protection, kill scores and a three-second respawn. This is a practice skirmish,
not a finished competitive round/objective ruleset.

## Start and join

1. On the host PC, double-click `E:\Fast Snipe\Host Multiplayer.cmd`.
   Node.js 22 or newer and this project's installed packages are required. The
   launcher builds the current game, including published poses, then serves it
   and the multiplayer endpoint on TCP port 2567. Keep its window open.
2. The launcher opens the host page in your default browser (or open its printed
   `Host:` URL yourself). Enter a name, optionally enter
   a room password, and click **Create room**, then **Enter private match**.
3. Friends on the same Wi-Fi/LAN open the `Friends on your Wi-Fi:` URL printed
   in that window. Select the same map, enter their name, room code and password
   if set, then click **Join room** and **Enter private match**.

Friends do not need this source project or Node.js. They download the game from
the host's browser URL. If Windows asks, allow Node.js on your private network.
The host address is the host PC's LAN IP, **not** `127.0.0.1` on a friend's PC.
The address may change after reconnecting to Wi-Fi. Guest Wi-Fi isolation and
firewalls can prevent joining even on the same router.

For a quick test on one PC, use two separate browsers/private windows. Create in
one and join its room code in the other. The host console must stay open. Closing
the host's browser does not stop the server while another player remains; closing
the server ends the match. Empty rooms are discarded. To create a fresh map,
everyone leaves the old room and the host creates another.

## Internet play

The server does not provide public discovery, tunnelling, STUN or TURN. An invite
containing a LAN IP works only on that LAN. Friends on different networks need a
reachable host, for example an appropriately configured VPN or TCP port forward.
CGNAT can prevent port forwarding. This connection setup and real wide-area latency
have not been verified by the local two-browser checks. Do not describe the LAN
test as proof of public internet connectivity.

## What is shared

- Server-simulated movement and collision using the existing movement controller.
  Clients predict locally, reconcile acknowledged inputs and interpolate peers.
- Rifle/pistol/sniper selection, shots, server inventory, fire-rate limits, reload,
  hit detection, health, deaths, respawns and team kill scores.
- Crouching, walking, sprinting, jumping, sliding, leaning, ADS and reload states
  rendered through the existing full-body rig and published grip poses.
- Server grenade inventory, pin cooking, launch, collision, fuse and frag damage.
  Smoke lifetime is included in snapshots for late joiners. Flash and explosion
  audiovisual effects are reproduced on browsers.
- Structural damage is simulated once on the server. Compressed geometry and
  collision changes, broken floor cells, prop transforms and door state are sent
  to browsers. Late joiners receive the accumulated world patch. Tiny debris,
  dust, bullet marks and ragdolls are visual effects, not individually networked
  physical bodies. Authoritative large-object physics remains on the host server.

Map construction uses a scoped fixed seed in private matches so object IDs match.
Single-player construction, controls, saved poses and studio saving remain separate.
Server HTTP serves only `dist/`; it does not expose the studio's source-writing API.

## Practical limits

This is a small private alpha. No host migration, account system, reconnect-token
restoration, voice chat, public matchmaking or historical hit rewind is included.
Hit checks use current server positions, so higher-latency internet games need
lag-compensation work. The host can modify its own server and is therefore trusted.
Four-player performance under heavy concurrent villa destruction needs measurement
on real devices; do not claim production anti-cheat or guaranteed frame rates.

## Development and checks

`npm run server` starts the server without rebuilding; `npm run host` builds first.
`PORT` changes the listening port. During development, Vite may run on 5181 and
the multiplayer address field should point to `http://127.0.0.1:2567`.

- `node --test tests/multiplayer.test.js`: authoritative combat, input validation,
  inventory/fuse, deterministic IDs and exact late-join floor geometry/collision.
- `node scripts/check-private-multiplayer.mjs`: two isolated browser profiles,
  joining, movement, existing rig loading, damage, elimination and respawn.
- Add `--villa` for the villa browser check. Run maps sequentially because one
  host process deliberately permits only one active room.

Browser checks never click studio Save and never write the pose library.

## Quiet-match smoothness

Local eye position interpolates between 60 Hz predicted movement ticks; mouse
look updates each rendered frame. Physics and server hit checks keep their
original rate. Remote height, lean and pitch interpolate along with position.
Hidden connected tabs skip animation/render work while incoming snapshots stay
active, and clear held movement/fire input when hidden.

World polling compares live matrices before cloning changed transforms, avoiding
3,421 temporary matrix copies per quiet villa poll. Geometry/collision patches
and saved character poses are unchanged.

`node --test tests/multiplayer-smoothness.test.js` checks presentation endpoints,
respawn resets and unchanged-world allocation/dirty detection. For a separate
test server on port 2568 and Vite on 5181, run
`node scripts/profile-multiplayer.mjs E:/Cache/Temp/multiplayer-profile.json`.
This creates its own two-player villa room, measures frame/phase timings and
checks movement plus hidden-tab snapshot delivery. Do not use port 2568 for a
real match during this check. Headless timings are not a guarantee of displayed
FPS on other devices or under destruction load.

Door and moving-object transforms interpolate over the world update interval.
Collision boxes still apply immediately from the server; new holes, broken
geometry and late-join snapshots apply exactly without interpolation. Door-only
updates omit unchanged fracture ranges, and moving-door shadows invalidate their
region instead of requesting a full shadow refresh for every network packet.

Fire messages use the displayed camera direction, rather than movement angles
that already include the next frame's recoil. The server still owns shot origin,
spread, damage and cover checks. Protocol version 4 requires both server and
clients to refresh after this update.

`node --test tests/network-doors-aim.test.js` checks villa/training hinges,
authoritative collision, late joins and recoil/aim alignment. With Vite on 5181,
`node scripts/check-network-doors-aim.mjs` runs an isolated real-socket browser
check: a door moves on frames between packets, and a scoped sniper shot hits
the target head. It never creates a room on the user's running host server.

Network door collision uses the leaf's world matrix for previous-foot height and
velocity rotation. Matrix-only replicated colliders must not use zero local
position/rotation fields, which could incorrectly step a player onto the top of
an upper-floor door. Deserialized collider transforms are also decomposed into
their local fields. `tests/network-door-collision.test.js` covers floor heights,
swing angles and parented transforms; `scripts/check-network-door-collision.mjs`
checks sprinting with repeated door toggles on both upper villa floors through
an isolated server and browser.

Material break cues are emitted when a visible glass/ceramic object disappears,
with spatial glass audio and fragments on clients. These one-time cues are not
stored in late-join snapshots. Door toggles and ordinary solid impacts also
play their existing sounds. Water bullet hits carry a distinct water material
and strength, invoking the existing bounded splash/ripple code; submerged solid
hits do not produce dry dust or hard-surface sounds.

Geometry patches carry a compact fractured-wall marker for leak detection.
Water volumes and nonempty puddle cells synchronize twice per second when
changed, plus on join; visual droplets and flow still update each client frame.
`tests/network-material-water.test.js` covers water penetration, leak parity,
late-join liquid state and one-time spatial break cues.
`node scripts/check-network-material-water.mjs` checks these effects on two
browser clients through an isolated villa server (Vite on 5181).

## Throwable and smoke presentation

Protocol 4 includes the corrected wellness-pavilion landing: the outdoor stone
landing no longer overlaps the indoor wood floor at the same height. Both
clients and the host must restart/refresh for the matching map layout.

Thrown utility uses a 75 ms snapshot interpolation buffer for visible flight;
server collision, bounces and detonation remain authoritative. Missing packets
hold the last sample rather than extrapolating through a wall.

Villa smoke composites after ambient occlusion, using the existing depth buffer
so occlusion outlines cannot show people through dense smoke. Three overlapping
analytic lobes expand and drift, clipped to room bounds. This uses one screen
pass for up to eight clouds, disabled when none exist; extra clouds use the
existing bounded billboard fallback. No extra scene render or ray marching is
introduced. Training retains its billboard smoke.

Frag dust/sparks and the short flash burst share a preallocated 96-particle GPU
pool. These particles do not create physics bodies, collision queries or dynamic
lights. Existing damage, fragment simulation and flash exposure rules remain.

`tests/utility-presentation.test.js` checks interpolation, bounded smoke/particle
work, and the indoor/outdoor floor surfaces. With Vite on 5181,
`node scripts/check-network-utility.mjs` checks real network flight and smoke/flash
events through an isolated server. `node scripts/check-utility-effects.mjs`
captures smoke/floor images and compares smoke frame times in the same scene.
The local headless comparison measured 7.02 ms mean / 8.5 ms p95 with volume
smoke versus 7.36 ms / 8.8 ms for billboards, with three clouds and detonation
effects. These measurements are not an FPS guarantee for other GPUs or loads.

## Damaged door support and player collision

Hinged leaves resolve player contact horizontally; their low fracture cells are
not stair treads. This prevents rapid swinging/toggling from ratcheting a capsule
upward. Standing and crouching keep their existing floor support.

Villa doors check surviving wood at the two hinge mounts on local x=0. Losing
both mounts releases the remaining damaged leaf into the existing rigid-body
system; damaging only the latch edge or one mount does not release it. Existing
frame-support failure still works. Released leaves retain their holes, stop
accepting open/close interactions, and replicate their detached state and motion.
This is a two-mount release check, not a simulation of bending metal hinges or
individual screws. There is no ongoing new body until support fails.

`node scripts/check-damaged-door.mjs` uses an isolated multiplayer villa room to
check repeated rapid toggling against a damaged wellness door, then hinge loss
and the client-visible fallen leaf. Regression tests cover low broken cells,
standing/crouching, multiple floor heights, and latch-versus-hinge damage.

## Multiple water breaches

Each changed tub wall is sampled once per geometry revision. Connected empty
samples form independent openings, with each jet anchored to a real empty
sample on the outside shell surface. Separate holes are no longer collapsed
into an average point between them. Unchanged walls reuse cached openings.

Each opening integrates discharge over its submerged sample areas using
Q = 0.62 A sqrt(2 g h). All outlets use the same pre-drain water level each tick;
their combined discharge drains the body once, conserving volume. Higher holes
go dry first, partially exposed holes lose wet area, and water remains below the
lowest sill. Hole shape/area is approximated on a 6 cm by 3 cm sampling grid.

Up to 64 flowing outlets per body use one instanced draw with five ballistic
segments each. Existing puddle limits remain. No water rigid bodies or extra
network stream packets are created. Clients and late joiners reconstruct the
same outlets from replicated damage geometry and authoritative water volume.

`tests/water-leaks.test.js` covers outlet alignment, replicated geometry, head,
area, partial submergence, combined drainage and water conservation.
`node scripts/check-multiple-water-leaks.mjs` checks three real tub punctures on
a host client and a second client joining after the damage, and captures a view.


## Graphics and host latency balancing

The pause/start menu has device-local Auto, Low, Medium, High and Custom graphics settings. These adjust render resolution, cached shadow-map resolution and ambient occlusion; objects, damage, collision, and smoke density remain the same. Auto starts at Medium, samples sustained frame rates while playing, and uses a cooldown between changes. It targets 60 FPS but cannot guarantee it on every device. The HUD shows measured FPS.

When creating a room, optionally check **Balance host latency**. The server probes every player once per second, averages six samples, and locks a target based on the slowest guest average (capped at 250 ms). The difference from the creator's actual RTT is split equally across incoming gameplay commands and outgoing gameplay updates. Ping/probe traffic and initial loading are not delayed. Local prediction remains responsive, so this reduces authority/confirmation advantage rather than making every player's experience identical. The HUD distinguishes real ping, target RTT, and added host RTT. Off is the default. Joining after calibration does not move the target; create a new room to recalibrate. This is a private-match option, not a substitute for geographically nearby dedicated servers or lag compensation.


## Teams, scoreboard, and presentation

Players are automatically assigned to the smaller team: Red first, then Blue. In Villa, Red spawns in the lower arrival court and Blue on the raised pool terrace, facing toward the building. Respawns stay on the assigned side and choose the most separated available spawn lane. Training also has opposing spawn lanes. Room capacity remains four players.

Hold **Tab** while playing for the team scoreboard: player name, alive/respawning status, kills, deaths, and measured real ping. Release Tab to close it. It also closes when the browser loses focus or pointer lock. Stats come from the authoritative room; enemy health values are not displayed.

Smoke deployment audio plays once for everyone when the server announces detonation; late joiners receive the existing smoke volume without replaying its deployment sound. Local third-person bodies interpolate the same fixed ticks as the eye camera. Remote characters interpolate server timestamps with a 120 ms presentation buffer and at most 80 ms extrapolation through short packet gaps. These are presentation changes; damage and movement authority stay on the server.


## Joining sides and spectating

Choose **Red**, **Blue**, or **Spectator** before creating/joining a room. Each fighting side has two slots; a full side is rejected with a message rather than silently moving you. Spectators use one of the room's four total connections, have no character or combat actions, and can watch either team. Left/Right arrows cycle living players.

After dying, combat input stops and the camera automatically follows a living teammate until the existing three-second respawn completes. Dead players can only watch their own team; if none survive, the death view/countdown remains. Respawning restores normal controls and the previous first/third-person preference.

Authoritative damage events drive hurt/death audio, a directional hit indicator, an impact redness pulse and persistent low-health edge redness. Feedback is deduplicated against health snapshots. Kill-feed events include server-supplied player names and weapon/headshot information and are shown to every connected player, including victims and spectators.
