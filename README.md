# Shred Slope 🏂

A 3D snowboarding game that runs in the browser. Pick one of twenty-three mountains, from a sunny bluebird day to an ice cave, rail parks, cliff drops, three giant kickers in a row, Olympic-style big air, halfpipe and snowboard cross, the slopestyle courses of the 2014, 2018, 2022 and 2026 Games rebuilt section by section, or three tight Youth Olympic parks, hit kickers and rails, land spins and flips, and race up to 9 friends online.

- **Twenty-three mountains:** each with its own light, sky, course shape and zones (see below). Every run builds a fresh course, or you can ride the same one again against a see-through ghost of your best run.
- **Star challenges:** 3 stars to earn on every mountain (69 in total), saved together with your best score per mountain.
- **Accounts:** create an account with a username and password and your stars, best runs, outfit and settings are saved on the server, so they follow you to any computer. Playing as a guest still works and keeps progress in that browser; whatever you earned as a guest joins your account when you sign up. Signed-in riders race under their account name in multiplayer.
- **Auto rail:** ride straight at a rail and you hop onto it by yourself (it also pops you off a gap kicker toward its rail). It's on by default and can be turned off in Settings.
- **Multiplayer:** 3 servers with up to 10 riders each. Everyone races the same course in rounds. You need an account to join (guests can still ride singleplayer).
- **Voice chat:** talk to the other riders on your server. When you join, the game asks whether to turn your mic on (open mic, push-to-talk on `V`, or no voice), with a "don't ask again" box. You can change it any time in Settings, mute anyone in the voice list, and riders without a mic still hear everyone.
- **Map votes:** in multiplayer, tap the **NEXT: … · VOTE** chip at the top of the screen (or **VOTE FOR A MAP** in the menu) and pick a mountain. The next round goes to the mountain with the most votes; if more than half the server votes for one during the countdown, the round switches to it straight away.
- **Map pictures:** every mountain's card shows a real shot from the game: a rider over one of its jumps, on its longest rail, above the superpipe's lip or off a cliff.
- **Looks:** a detailed rider in a puffer jacket with a broad band across the chest and sleeves, a neck warmer pulled up to the nose, a hard-shell helmet and big framed goggles with mirrored lenses, straight pants, mittens and strap bindings. The season pass shows a real photo of your rider in the outfit you pick, taken on the mountain behind the title screen, board dents pressed into the powder, northern lights, drifting clouds, glittering snow under floodlights, carve lines in the snow, safety nets, warm-lit huts and fireworks at the finish.
- **Far view:** past the detailed course, a lighter version of the whole valley (ground, trees and the valley walls) runs on for another 1.2 to 1.7 km, built in the background, so you look down the mountain instead of into fog. On High and Medium; Low keeps the fog.
- **Snow and rock:** the snow has its own relief, lit per pixel: wind drifts (deeper off the groomed piste), ripples and grain, with the lee sides going cold and blue. The valley walls carry streaks down their gullies and bare rock ribs high up. Boulders and outcrops sit half buried on the banks, and no two trees grow quite straight.
- **Graphics:** real-time sun shadows for the riders (on the snow and on themselves), terrain that shades itself (banks and kickers throw long shadows at sunset, hollows go darker), cold blue shade on the snow, wind ripples that catch the light, haze that glows toward the sun, bloom on lights, sun rays, filmic colour grading per time of day, and FXAA. Trees are snow-laden firs, spruces, pines and dead snags, each with its own shade of green and snow load. Mountain ranges stand in three layers with smooth snow and rock, rising out of valley mist. Riders wear baggy outerwear with real fabric folds, plaid flannel, camo or colour-blocked jackets, beanies or helmets, mirrored goggles, and snow stuck to their pants. The Graphics setting scales it: High has everything, Medium drops the sun rays and uses smaller shadow maps, Low turns shadows, bloom and sun rays off for older devices (it keeps FXAA and the colour grade).
- **Feel:** smooth carving, powerslides, pre-spins, a boost meter you fill with tricks, rail balance, legs that soak up bumps, a banking camera, and landings graded PERFECT, clean or SKETCHY.
- **Physics:** real gravity (9.81 m/s²) on every jump, snow friction and air drag that grows with speed (tuck to cut it), carves limited by edge grip so a turn that's too sharp for your speed skids and scrubs speed, and landings that keep the part of your speed along the slope (a steep landing keeps you moving, landing flat stops you). Riding at a jump never slows you down, on the in-run or in the air: if you come in faster than the kicker is built for, you leave the lip on a flatter line, like a rider soaking it up with their knees, so you come down on its landing (or a gap kicker's rail, or a step-up's table) where you can. Really fast, you fly past the landing hill and touch down on the slope below. Too slow, and you tuck and pump up to the speed it needs. Boosting skips the easing, so a boosted send is all yours. Let go of the steering and the board keeps going the way you pointed it; it doesn't swing back down the hill by itself. An ollie with a rail ahead is sized so you come down onto it.
- **Extras:** 10 outfits, glowing snowflake tokens to collect, a generative soundtrack, and settings for graphics, frame rate, music, sound and camera.
- **Smooth frame rate:** the course is built 50 m at a time in a background thread (a Web Worker running the same world code with the same seed), so new parts of the mountain never hold up a frame. The frame rate is capped at 30, 60 or 90 FPS (60 to start with).
- **No installs, no libraries:** a small hand-written WebGL engine and a plain Node.js server with zero dependencies.

## The mountains

| Mountain | Time | What's special |
| --- | --- | --- |
| **Bluebird Peak** | Sunny day | Wide piste, blue sky, sun glare, long tree shadows and the biggest kickers (MEGA AIR). Easiest. |
| **Golden Ridge** | Sunset | Low orange sun, pink snow, a winding ridge with fast rollers. |
| **Floodlit Night** | Night | The original: floodlights, northern lights and a shuffled zone order every run. |
| **Moonlit Woods** | Night | Full moon, heavy snowfall, a dense forest and a TREE SLALOM through red and blue gates. Hardest. |
| **Big Air Valley** | Sunny day | Three giant kickers with huge landing hills: about 5 seconds of air, 35 m above the snow. The in-run sets your takeoff speed so you always reach the landing. |
| **Crystal Caverns** | Underground | Ride into the mountain through an ice cave lit by glowing crystals, with icicles, ice pillars to dodge and glowing rails, then out into the night. |
| **Rail Kingdom** | Sunny day | A rail park: long flat rails, gap rails, rainbow (arched) rails and mega rails up to 50 m long. |
| **Triple Giants** | Golden hour | Three giant kickers back to back to back. Land all three. |
| **Gold Medal Slopestyle** | Sunny day | A competition course built like the Olympic one: three rail sections with three lines each, then three big jumps with a small, medium and big kicker side by side, past grandstands full of fans. |
| **Jump Line** | Night | Floodlit kicker lines, one jump straight after the other. Built for perfect landings. |
| **Cliff Drops** | Snowstorm | Backcountry: no poles, low visibility, rock bands to drop off and pillow fields to bounce through. |
| **Neon Park** | Night | Glowing pink and cyan boxes and rails under coloured lamps. |
| **Big Air Final** | Night | The city big air: drop in from a 40 m scaffold tower, one giant jump, land in a stadium full of fans, with a city skyline all around. |
| **Superpipe Final** | Night | A floodlit competition halfpipe. Ride wall to wall and fly out of the coping; steer toward the wall you're heading for to pump higher. |
| **Snowboard Cross** | Sunny day | Race three rivals (NOVA, KAI and JUNO) through banked turns, rollers, step-ups and a final jump. First to the line wins. |
| **Slopestyle Qualifier** | Golden hour | The second competition course: kinked rail, long box, down-rail, then three jump lines. |
| **Sochi 2014 Slopestyle** | Sunny day | The first Olympic slopestyle: it opens with a jump onto a rail, three jib sections, then jumps of 18, 18 and 22 m, each with a smaller jump beside it, and the giant nesting doll by jump 2. |
| **PyeongChang 2018 Slopestyle** | Cold and windy | Butter pad to down rail, trapezoid rail, rainbow to flat-down with a wallride; a high bar with three take-offs; a skate bowl with a curved rail; three butter boxes; skewed jumps; a jump with quarterpipe side hits; the cheese-wedge kicker. |
| **Beijing 2022 Slopestyle** | Cold and clear | Rails stepped down from left to right behind a Great Wall replica: rainbow to down, tank, flat rail, down-flat-down, transfer mailbox; a watch tower with a rail on its roof; gap to flat rail, roller, cannon; the twisted sisters skew jumps, the matrix (roller to knuckle, transfer jumps, quarterpipes) and a 5 m kicker over a 21 m table. |
| **Livigno 2026 Slopestyle** | Snowy day | Big, clean, simple modules: long box, down and kinked rails, rainbow box, gap to down rail, then jumps of 22 to 25 m with a side option each. The exact 2026 rail layout wasn't published in detail, so the rails follow the "clean features" brief. |
| **Innsbruck 2012 Youth Park** | Sunny day | Kühtai, above the trees in the Tyrol: log slides, an A-frame box, a wave box, a stair set with a handrail, a double barrel, a step-up and a step-down, then a tight kicker line and an 18 m big line. |
| **Lausanne 2020 Youth Park** | Windy day | Leysin Park & Pipe in red and white: gaps to rails and boxes, three step-ups side by side, a nine-stair with two handrails, twin kickers with quarterpipe side hits and a big step-down to finish. |
| **Gangwon 2024 Youth Park** | Cold and clear | Welli Hilli Park under a low winter sun: two pyramid funboxes with a box over the top, wave boxes, stair sets, step-downs, quarterpipe side hits and an 18 m big line. |

Courses built like the ones at the Games carry an **OLYMPIC STYLE** badge in the mountain picker and on the title card. On the Olympic courses rails come in real shapes (down, flat-down, down-flat-down, rainbow, cannon, mailbox, butter pad, high bar), many start on snow decks, and an ollie with a rail just ahead is sized to land you on it.

The three Youth Olympic parks are short (about a minute) and packed: three lanes of features about 11 m apart, with a new one every 15 to 25 m down each lane, so there's always something to hit. They bring new features: **step-ups** (pop over a dip onto a table built higher than the lip), **step-downs** (ride up onto a deck and drop off its kick onto a long landing), **stair sets** with handrails (level treads, so you clear the stairs or grind the rail), **log slides**, **double barrels** (a high and a low rail side by side), **wave boxes**, **A-frame boxes** and **pyramid funboxes**. The Youth Games course plans weren't published feature by feature, so these are built in the style of each park rather than copied from it.

Star challenges: every mountain has "Finish the run" plus two of its own, like *Score 15,000*, *Land 4 perfect landings*, *Finish under 1:50*, *Finish without bailing*, *Grind for 12 seconds* or *Land all three giants*. The mountain picker shows five mountains per page; switch pages with the arrows next to BACK (or `←` `→`).

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

**Accounts need a disk.** Accounts are saved in `accounts.json` on a persistent disk mounted at `/var/data` (`render.yaml` asks for a 1 GB one). Without a disk, every deploy or restart wipes the file and everyone's account with it. If you made the service by hand rather than from the Blueprint, open the service → **Disks** → **Add disk**, set the mount path to `/var/data`, size 1 GB, and save. Disks cost a little extra per GB each month, and a service with a disk has a few seconds of downtime on each deploy. Render takes a snapshot of the disk every day. To keep the file somewhere else, set `DATA_DIR`.

**Already made a free service?** Changing `render.yaml` doesn't change the size of a service that already exists. Open the service, go to **Settings → Instance Type** and pick **Starter**.

**Your own domain (optional):** on the service, open **Settings → Custom Domains**, add e.g. `shredslope.fun`, and create the DNS record Render shows you at your domain registrar.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Carve left / right | `A` `D` (or `←` `→`) | ◀ ▶ |
| Jump | `Space` (hold `Shift` first for a bigger pop) | POP |
| Speed up | `W` (or `↑`) on the snow | |
| Powerslide (brake) | `S` (or `↓`) on the snow | |
| Spin / steer in the air | tap `A` `D` to drift sideways (a ring shows where you'll land), hold to spin | ◀ ▶ in the air |
| Front / back flip | `W` / `S` in the air | hold FLIP (back flip) |
| Grab | `Shift` (or `E`) in the air, tap again to switch grab | hold POP in the air |
| Boost | hold `F` | hold BOOST |
| Keep your balance on a rail | `←` `→` against the lean | ◀ ▶ |
| Menu | `Esc` | ☰ MENU |
| Sound on/off | `M` | |
| Talk (push-to-talk voice) | hold `V` | HOLD TO TALK |

## Tricks and scoring

- **Air control:** tap A or D in the air to drift sideways and line up a rail or a landing; a ring on the snow shows where you'll come down (green when it's a rail or box). Hold A or D to spin instead.
- **Crashes:** catch an edge and you get slammed onto your back or front; bail a landing and you cartwheel down the hill; hit a tree and you bounce off it. Then you get back up.
- **Spins:** 180, 360, 540, 720… The more you rotate, the more points.
- **Flips:** BACKFLIP and FRONTFLIP. Flip and spin together for a RODEO (back) or MISTY (front). Two flips make it a DOUBLE.
- **Grabs:** hold grab in the air for METHOD, INDY, MUTE, JAPAN and friends. Which grab you get depends on how you spin or flip; tap grab again mid-air to switch, and hold two in one jump for a bigger score (METHOD TO INDY).
- **Grinds:** ride onto a box from its ramp, or pop onto a rail, for a 50-50.
- **Combos:** tricks chain into a combo with a growing multiplier. The combo banks after about 2 seconds of clean riding.
- **Bails:** land sideways or upside down, or hit a tree, and you lose the combo you haven't banked yet. You get back on your feet straight away.
- **Time bonus:** finish under 2:30 for extra points.
- **Landings:** a clean, square landing is a PERFECT (+15% points and a little speed). A messy one is SKETCHY: fewer points and you wobble. Your legs soak up more on long airs, so big jumps still land PERFECT when your rotation is clean.
- **Tokens:** each glowing snowflake is worth 50 points. They sit along jump arcs, above boxes and rails, through slalom gates and in slalom lines.
- **Boost:** tricks, tokens, grinds and perfect landings fill the BOOST meter. Hold `F` to burn it for extra speed (up to about 190 km/h).
- **Rail balance:** on a box or rail a balance bar appears. Steer against the lean to stay on; tip all the way over and you bail. A steady grind gets PERFECT BALANCE (+30%). Rails are wobblier than boxes and worth more.

Let go of the keys before you land. The rider straightens up to the nearest clean landing by themself.

## How multiplayer works

- The server list shows 3 servers, each with room for 10 riders. A full server shows **FULL**.
- A round goes **countdown (10 s) → race → results (12 s) → next round**. Everyone gets the same course, built from a seed the server picks.
- You need an account to join a server. Without one, the servers panel shows **Create an account to play multiplayer** with buttons to create one or sign in. Your account name is your name in the race.
- The mountain changes every round and goes through all twenty-three, then around again, unless riders vote. Tap **NEXT: … · VOTE** at the top (or **VOTE FOR A MAP** in the menu) and pick a mountain: the next round goes to the one with the most votes (a tie is picked at random). If more than half the riders vote for the same mountain during the countdown, the round switches to it right away. Tap your vote again to take it back.
- The three servers start on different mountains, and the server list shows which one is up.
- Riders who join during the countdown, or in the first 30 seconds of a race, ride the current round. Anyone later watches until the next one starts (← → switches who you watch).
- The race ends when everyone has finished, or after 4 minutes. Highest score wins.
- **Voice chat** goes straight between the riders' browsers (WebRTC, peer to peer); the server only passes along the messages that set up each connection, and only between riders who have voice on. The first time you join, the game asks whether to use your mic. Choose open mic, push-to-talk (hold `V`), or no voice, and tick "don't ask again" to skip the question next time. Settings → Voice chat changes it later (Ask / Off / Push / Open). The voice panel at the bottom left lists who's on voice; a ring lights up while someone talks, and you can mute anyone. The browser asks for mic permission the first time. Voice needs the page on `https` (Render gives you that) or `localhost`.
- **Voice on strict networks:** voice finds a route between riders with a public STUN server. On some school or office networks that isn't enough, and those riders hear nothing. A TURN relay fixes that: set `ICE_SERVERS` (see Settings below) to your TURN server's details.

## Project layout

| File | What it does |
| --- | --- |
| `server.js` | Node server: serves the game, `/api/servers`, `/health`, and the WebSocket rooms |
| `accounts.js` | Accounts: sign up, sign in, sign out, delete, and the saved game per account (`/api/auth/*`, `/api/me`, `/api/save`). Passwords are hashed with scrypt; sign-in attempts are rate limited per IP |
| `render.yaml` | Render Blueprint (one Starter web service with a 1 GB disk for accounts) |
| `public/index.html` | Page, HUD and menus |
| `public/style.css` | HUD and menu styling |
| `public/js/engine.js` | Tiny WebGL engine: matrices, shaders, drawing |
| `public/js/world.js` | The twenty-three mountains and the seeded course: terrain, cave, cliffs, halfpipe, scaffold tower, banked turns, kickers, giant jumps, rails, grandstands, trees, mountain ranges, city skyline, lights, chairlift |
| `public/js/chunks.js` | The background worker that bakes the course's 50 m chunks off the main thread (it loads `engine.js` and `world.js`) |
| `public/js/rider.js` | The 3D snowboarder and its poses |
| `public/js/game.js` | Physics, tricks, camera, HUD, menus, multiplayer flow |
| `public/js/net.js` | Multiplayer client |
| `public/js/account.js` | The sign in / create account screen, the account strip on the season pass, and syncing your save |
| `public/js/voice.js` | Voice chat: the mic, a WebRTC connection to each rider on voice, push-to-talk, mute and the talking rings |
| `public/img/maps/` | The picture on each mountain's card (one JPEG per mountain, named after its id) |
| `public/js/audio.js` | Synthesised sound effects |

## Settings

In the game, **Settings** (on the title screen and in the menu) has Graphics (Low / Medium / High), Frame rate (30 / 60 / 90 FPS, 60 by default), Music, Sound effects, Camera (Close / Far / High: High hangs the camera up in the sky behind you, like a drone), Auto rail (On / Off) and Voice chat (Ask / Off / Push / Open). Low graphics and 30 FPS are the ones to pick on older school computers. 90 FPS needs a screen that runs at 90 Hz or more; on a 60 Hz screen it stays at 60.

The server reads these environment variables (all optional):

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on (Render sets this itself) |
| `COUNTDOWN_MS` | `10000` | Countdown before each round |
| `RACE_MAX_MS` | `240000` | Longest a round can last |
| `RESULTS_MS` | `12000` | How long the results stay up |
| `DATA_DIR` | `/var/data` if it exists, else `./data` | Where `accounts.json` is kept |
| `MP_GUESTS` | off | Set to `1` to let riders without an account join multiplayer |
| `ICE_SERVERS` | Google's public STUN | Voice chat route finders, as JSON in the WebRTC format, e.g. `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]`. Add a TURN server if voice doesn't connect on some networks |

Gameplay numbers (gravity, spin speed, top speed) are at the top of `public/js/game.js`. The course layout (length, piste width, zone list, kicker sizes) is at the top of `public/js/world.js`.
