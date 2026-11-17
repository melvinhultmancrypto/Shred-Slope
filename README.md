# Shred Slope 🏂

A snowboarding game you play right in the browser, in the same spirit as the ski games everyone plays on school computers.

Carve down an endless, winding mountain. Dodge trees, rocks and snowmen, grab coins, hit kickers and land spins for big points. It gets faster the further you ride.

## Play

- **Locally:** download the repo and open `index.html` in any modern browser. Everything runs offline, with no install and no build step.
- **Online:** turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). The game will be live at `https://<your-username>.github.io/Shred-Slope/`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Carve left / right | `←` `→` or `A` `D` | ◀ ▶ buttons |
| Jump (ollie) | `Space`, `↑` or `W` | JUMP |
| Spin (in the air) | `←` `→` | ◀ ▶ |
| Grab (in the air) | `↓` or `S` | hold JUMP |
| Pause | `P` or `Esc` | ❚❚ button |
| Sound on/off | `M` | 🔊 button |

## Scoring

- **1 point** for every metre you ride
- **25 points** per coin
- **Tricks:** 180 = 100, 360 = 250, 540 = 450, 720 = 700 and more. A grab adds a bonus, and so does big air time.
- Let go of the arrow keys before you land. If you're more than about 55° off when you touch down, you wipe out.
- Rocks are low enough to jump over. Trees and snowmen are not.

Your best score is saved in the browser.

## How it works

The whole game is three files with no libraries:

| File | What it is |
| --- | --- |
| `index.html` | Page layout: canvas, HUD and menus |
| `style.css` | Look of the HUD, menus and touch buttons |
| `game.js` | The game: pseudo-3D renderer, physics, spawning, sound, input |

- **Rendering:** Canvas 2D with a simple perspective projection. Every object has a world position in metres and is scaled by distance. The trees, rocks and snowmen are drawn once into off-screen canvases and reused as sprites.
- **Track:** the piste winds left and right following a sum of sine waves (`center(z)` in `game.js`). Obstacles spawn in patterns ahead of you (scattered rows, coin lines, tree gates, rock rows and kickers), and every row leaves a way through.
- **Sound:** synthesised with the Web Audio API, so there are no sound files.
- **Tuning:** all the main numbers (speed, gravity, jump height, spin rate, piste width) are in the `CFG` object at the top of `game.js`.

## Ideas for next steps

- Character and board customisation, unlocked with coins
- Night mode and storms
- Rails and boxes to grind
- More obstacle types: skiers, cabins, fences
- Daily challenge with a fixed seed
- Online leaderboard
