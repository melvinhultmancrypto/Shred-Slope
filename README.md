# Shred Slope 🏂

A 3D night-time snowboarding game that runs in the browser. Ride a floodlit mountain through kickers, rails and pine trees, land spins and flips, and race up to 9 friends online.

- **Singleplayer:** a new mountain every run, or ride the same one again against a see-through ghost of your best run.
- **Multiplayer:** 3 servers with up to 10 riders each. Everyone races the same mountain in rounds.
- **Looks:** northern lights, drifting clouds, glittering snow under floodlights, carve lines in the snow, safety nets, warm-lit huts and fireworks at the finish.
- **Feel:** smooth carving, powerslides, pre-spins, legs that soak up bumps, a banking camera, and landings graded PERFECT, clean or SKETCHY.
- **Extras:** 10 outfits, glowing snowflake tokens to collect, a generative soundtrack, and settings for graphics, music, sound and camera.
- **No installs, no libraries:** a small hand-written WebGL engine and a plain Node.js server with zero dependencies.

## Play it

| Where | How |
| --- | --- |
| Online | Deploy to Render (steps below). Your game will live at `https://<name>.onrender.com`. |
| On your computer | Install [Node.js](https://nodejs.org) 18 or newer, then run `npm start` and open http://localhost:3000 |
| Singleplayer only | Open `public/index.html` straight in Chrome or Edge. Multiplayer needs the server. |

## Put it on Render

Render pulls the code straight from GitHub, so there is nothing to upload by hand. `render.yaml` is set up for the $7/month Starter size (0.5 CPU, 512 MB), which stays on all the time, in the Frankfurt region (closest to Scandinavia, so multiplayer lag stays low).

1. Sign in at [render.com](https://render.com) with your GitHub account and give Render access to the `Shred-Slope` repo.
2. Click **New → Blueprint**, pick `melvinhultmancrypto/Shred-Slope` and press **Apply**. Render reads `render.yaml` and creates the `shred-slope` web service.
3. Wait for the deploy log to say `Shred Slope running on port 10000 with 3 servers`. The status changes to **Live**.
4. Open the URL at the top of the service, e.g. `https://shred-slope.onrender.com`.
5. Every push to `main` redeploys automatically.

**If you'd rather not use the Blueprint:** choose **New → Web Service**, pick the repo, and use these settings:

| Setting | Value |
| --- | --- |
| Name | `shred-slope` (this becomes part of the URL) |
| Language | Node |
| Branch | `main` |
| Region | Frankfurt (EU Central) |
| Root directory | leave empty |
| Build command | `npm install` |
| Start command | `npm start` |
| Instance type | Starter ($7/month) |
| Health check path | `/health` (under Advanced) |
| Auto-deploy | On commit |
| Environment variables | none needed (Render sets `PORT` itself) |

**Keep it to one instance.** The multiplayer servers live in the server's memory, so scaling to 2+ instances would put players on different copies and they wouldn't see each other.

**Already made a free service?** Changing `render.yaml` doesn't change the size of a service that already exists. Open the service, go to **Settings → Instance Type** and pick **Starter**.

**Your own domain (optional):** on the service, open **Settings → Custom Domains**, add e.g. `shredslope.fun`, and create the DNS record Render shows you at your domain registrar.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Carve left / right | `←` `→` or `A` `D` | ◀ ▶ |
| Pop (jump) | hold `Space`, release to jump. Longer hold, bigger pop | hold and release POP |
| Spin | `←` `→` in the air | ◀ ▶ in the air |
| Front / back flip | `↑` / `↓` in the air (or `W` / `S`) | hold FLIP (back flip) |
| Grab | `Shift` (or `E`) in the air | hold POP in the air |
| Tuck for speed | `↓` on the snow | |
| Powerslide (brake) | `↑` on the snow | |
| Pre-spin | hold `←`/`→` while charging the pop | |
| Menu | `Esc` | ☰ MENU |
| Sound on/off | `M` | |

## Tricks and scoring

- **Spins:** 180, 360, 540, 720… The more you rotate, the more points.
- **Flips:** BACKFLIP and FRONTFLIP. Flip and spin together for a RODEO (back) or MISTY (front). Two flips make it a DOUBLE.
- **Grabs:** hold grab in the air for METHOD, INDY, MUTE and friends.
- **Grinds:** ride onto a box from its ramp, or pop onto a rail, for a 50-50.
- **Combos:** tricks chain into a combo with a growing multiplier. The combo banks after about 2 seconds of clean riding.
- **Bails:** land sideways or upside down, or hit a tree, and you lose the combo you haven't banked yet. You get back on your feet straight away.
- **Time bonus:** finish under 2:30 for extra points.
- **Landings:** a clean, square landing is a PERFECT (+15% points and a little speed). A messy one is SKETCHY: fewer points and you wobble.
- **Tokens:** each glowing snowflake is worth 50 points. They sit along jump arcs, above boxes and rails, and in slalom lines.

Let go of the keys before you land. The rider straightens up to the nearest clean landing by themself.

## How multiplayer works

- The server list shows 3 servers, each with room for 10 riders. A full server shows **FULL**.
- A round goes **countdown (10 s) → race → results (12 s) → next round**. Everyone gets the same mountain, built from a seed the server picks.
- Riders who join during the countdown, or in the first 30 seconds of a race, ride the current round. Anyone later watches until the next one starts (← → switches who you watch).
- The race ends when everyone has finished, or after 4 minutes. Highest score wins.

## Project layout

| File | What it does |
| --- | --- |
| `server.js` | Node server: serves the game, `/api/servers`, `/health`, and the WebSocket rooms |
| `render.yaml` | Render Blueprint (one free web service) |
| `public/index.html` | Page, HUD and menus |
| `public/style.css` | HUD and menu styling |
| `public/js/engine.js` | Tiny WebGL engine: matrices, shaders, drawing |
| `public/js/world.js` | Seeded mountain: terrain, kickers, rails, trees, lights, chairlift |
| `public/js/rider.js` | The 3D snowboarder and its poses |
| `public/js/game.js` | Physics, tricks, camera, HUD, menus, multiplayer flow |
| `public/js/net.js` | Multiplayer client |
| `public/js/audio.js` | Synthesised sound effects |

## Settings

In the game, **Settings** (on the title screen and in the menu) has Graphics (Low / Medium / High), Music, Sound effects and Camera (Close / Far). Low graphics is the one to pick on older school computers.

The server reads these environment variables (all optional):

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on (Render sets this itself) |
| `COUNTDOWN_MS` | `10000` | Countdown before each round |
| `RACE_MAX_MS` | `240000` | Longest a round can last |
| `RESULTS_MS` | `12000` | How long the results stay up |

Gameplay numbers (gravity, spin speed, top speed) are at the top of `public/js/game.js`. The course layout (length, piste width, zone list, kicker sizes) is at the top of `public/js/world.js`.
