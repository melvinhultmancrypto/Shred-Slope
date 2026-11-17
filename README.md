# Shred Slope 🏂

A 3D night-time snowboarding game that runs in the browser. Ride a floodlit mountain through kickers, rails and pine trees, land spins and flips, and race up to 9 friends online.

- **Singleplayer:** a new mountain every run. Chase your best score.
- **Multiplayer:** 3 servers with up to 10 riders each. Everyone races the same mountain in rounds.
- **No installs, no libraries:** a small hand-written WebGL engine and a plain Node.js server with zero dependencies.

## Play it

| Where | How |
| --- | --- |
| Online | Deploy to Render (steps below). Your game will live at `https://<name>.onrender.com`. |
| On your computer | Install [Node.js](https://nodejs.org) 18 or newer, then run `npm start` and open http://localhost:3000 |
| Singleplayer only | Open `public/index.html` straight in Chrome or Edge. Multiplayer needs the server. |

## Put it on Render

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. Click **New → Blueprint**, pick the `Shred-Slope` repo and press **Apply**. Render reads `render.yaml` and creates a free web service called `shred-slope`.
3. Wait for the deploy log to say `Shred Slope running on port 10000 with 3 servers`. The first deploy takes a couple of minutes.
4. Open the URL Render shows at the top of the service, e.g. `https://shred-slope.onrender.com`.
5. Every time you push to `main`, Render redeploys automatically.

**If you'd rather not use the Blueprint:** choose **New → Web Service**, pick the repo, and use these settings:

| Setting | Value |
| --- | --- |
| Language | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Instance type | Free |
| Health check path | `/health` |

**Good to know about the free plan:** it goes to sleep after 15 minutes with no visitors. The next visit wakes it up, which takes about a minute, so open the link a minute before you want to play. A paid instance never sleeps.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Carve left / right | `←` `→` or `A` `D` | ◀ ▶ |
| Pop (jump) | hold `Space`, release to jump. Longer hold, bigger pop | hold and release POP |
| Spin | `←` `→` in the air | ◀ ▶ in the air |
| Front / back flip | `↑` / `↓` in the air (or `W` / `S`) | hold FLIP (back flip) |
| Grab | `Shift` (or `E`) in the air | hold POP in the air |
| Tuck for speed | `↓` on the snow | |
| Brake | `↑` on the snow | |
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

The server reads these environment variables (all optional):

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on (Render sets this itself) |
| `COUNTDOWN_MS` | `10000` | Countdown before each round |
| `RACE_MAX_MS` | `240000` | Longest a round can last |
| `RESULTS_MS` | `12000` | How long the results stay up |

Gameplay numbers (gravity, spin speed, top speed) are at the top of `public/js/game.js`. The course layout (length, piste width, zone list, kicker sizes) is at the top of `public/js/world.js`.
