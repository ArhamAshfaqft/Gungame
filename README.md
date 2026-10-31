# Fast Snipe

A browser-based, single-player sniper arena prototype built with Three.js.

## Run

Install dependencies with `npm install`, then use `npm run dev` and open the local URL Vite prints.
Use `npm run build` for the production build and `npm run preview` to preview it.
Run the movement and gunplay regression checks with `npm test`.

## Controls

- WASD / arrow keys: move
- Shift + forward: sprint
- C / left Ctrl: slide; press again to cancel
- Space: jump / slide-jump
- Left mouse: fire
- Hold right mouse: scope
- R: reload
- Escape: pause and release mouse

The current mode uses seven respawning practice bots. It does not include multiplayer or enemy return fire.

## Visuals

The weapon renders through a separate 62-degree camera, with dedicated lighting and environment reflections.
The world camera handles movement FOV and sniper zoom independently. The player arms and enemy bodies come from
the same user-provided Mixamo SWAT character. A shared rig controller poses the hands on the scoped rifle and
supports idle, running, sprint, slide and airborne states. These are procedural poses, not motion-capture clips.
The current bot AI patrols on foot; the sprint/slide pose states can be driven by player or network movement state.

The original `Ch15_nonPBR.fbx` is kept untouched. `node scripts/prepare-swat.mjs` prepares the runtime asset while
the development server is available at `http://127.0.0.1:5180` (override with `ASSET_SERVER_URL`). This requires
the development dependencies and a Playwright Chromium browser. The export contains a 14,813-triangle remote body
and separate detailed arms with shared textures. Material groups are batched into two draws per body.
The preparation report is in `artifacts/swat-optimization.json`.

Static arena shadows are cached, high-DPI rendering is capped, and remote pose updates run at distance-based
intervals. First-person IK is recomputed only when a weapon action changes the grip.

The older Three.js soldier sample is retained as an unused asset with its source and license information in
`public/assets/heroes/CREDITS.md` and `THREE-LICENSE.txt`.
