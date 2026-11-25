# Shred Slope 🏂

A 3D snowboarding game that runs in the browser. Ride **Pine Valley**, a sunny resort run from the top of the chairlift down into a ski village, pick one of five streetwear riders with their own stats, throw real snowboard tricks (cab 540s, backside 900s, double corks, rodeos, misty flips and grabs), and race up to 9 friends online.

Join the community on Discord: **[discord.gg/eW5FGXt4pj](https://discord.gg/eW5FGXt4pj)** (there's a link under the Drop in button and one in the menu).

- **The lobby:** bright and snowy: a white rail of tabs down the left (**Play**, **Locker**, **Shop**, **Pass**, **Cups** (coming soon), **News**, and the settings gear at the bottom), the **Shred Slope** wordmark and your coins and account along the top, and a slow drone shot down the course behind it all. On **Play** your rider stands on the left holding the board, with their name, style and stats (drag to turn them round), and on the right sits the course card with your stars and best score, the season pass card, a big orange **DROP IN** button (Enter works too) and **Multiplayer**. On phones the rail turns into a tab bar along the bottom. Menus are frosted white panels with navy text; the warm orange is always the thing to press.
- **The riders:** five riders to pick in the Locker, sculpted in code as one smooth body each (no tubes and balls): the body is modelled like clay from soft shapes blended together, turned into a single mesh, and bent by an 11-bone skeleton, so shoulders, elbows, hips and knees flex like a real body. Each has a sculpted face (eyes with lids, nose, lips, ears), knitted hats with real ribs, hair and goggles with a frame round the lens. All in baggy streetwear (an oversized hoodie with a kangaroo pocket, ribbed cuffs and hem, wide pants stacked in folds over the boots): **Kai** (all-rounder, beanie and goggles), **Mia** (spinner, pom-pom beanie, goggles up, ponytail), **Dre** (speed, hood up over a beanie, neck gaiter), **Yuki** (big air, bucket hat with the goggles round it) and **Rio** (steady, slouchy beanie, curls and a beard). Every rider has **speed**, **air**, **spin** and **balance** from 1 to 5 (they add up to 12), and they change how the board rides. The suit, hat and goggles you wear colour whoever you ride as.
- **The HUD:** zone name and a course progress bar at the top left, the timer at the top centre, score, combo multiplier and snowflakes at the top right with a feed of your last banked combos under it, and a round speed gauge at the bottom right that lights up in the air. Every trick shows its full name and a breakdown of where the points came from (spin, flip, grab, airtime, landing).
- **Riding:** snappier than before (faster spins, bigger pops, tighter carves), but honest: come down sideways at speed and you catch an edge, slam a flat landing and your knees buckle, hold a hard skid too long at speed and the edge digs in, and the deep snow off the piste slows you down. The rider leans into carves and trails a hand in the snow, throws their arms out on rails, windmills on a sketchy landing, pulls their knees up at the top of a jump and reaches for the landing on the way down.
- **The camera:** a low chase camera over your right shoulder that pulls back and up when you take off, so you see the whole jump, then drops back in when you land. Far and High (a drone view) are in Settings.
- **Run complete:** your rider on the right, your score split into tricks, grabs, rails, landings and snowflakes, your best trick, and **Run it back**.
- **Star challenges:** 3 stars to earn on the course, saved together with your best score.
- **Accounts:** create an account with a username and password and your stars, best runs, outfit and settings are saved on the server, so they follow you to any computer. Playing as a guest still works and keeps progress in that browser; whatever you earned as a guest joins your account when you sign up. Signed-in riders race under their account name in multiplayer.
- **Auto rail:** ride straight at a rail and you hop onto it by yourself (it also pops you off a gap kicker toward its rail). It's on by default and can be turned off in Settings.
- **Multiplayer:** 3 servers with up to 10 riders each. Everyone races the same course in rounds. You need an account to join (guests can still ride singleplayer).
- **Voice chat:** talk to the other riders on your server. When you join, the game asks whether to turn your mic on (open mic, push-to-talk on `V`, or no voice), with a "don't ask again" box. You can change it any time in Settings, mute anyone in the voice list, and riders without a mic still hear everyone.
- **Coins, shop and locker:** with an account you earn coins (play money, no real money involved) for every run, every new star and multiplayer podiums, and spend them in the **Shop** on suits, boards, hats and goggles, shown on big cards with 3D pictures, which you try on your rider before you buy (drag to turn them round). The **Locker** puts on what you own, and other riders see your look in multiplayer. The Daily and Weekly **Cups** are coming soon. See [Coins, the shop and the cups](#coins-the-shop-and-the-cups).
- **Graphics:** real-time sun shadows for the riders, terrain that shades itself (banks and kickers throw long shadows in the low sun), wind ripples and drifts in the snow, haze that glows toward the sun, bloom on lights, sun rays, filmic colour grading and FXAA. Past the course a lighter version of the whole valley runs on for another 1.2 to 1.7 km, so you look down the mountain instead of into fog. The Graphics setting scales it: High has everything, Medium drops the sun rays and uses smaller shadow maps, Low turns shadows, bloom and sun rays off for older devices.
- **Feel:** smooth carving, powerslides, pre-spins, a boost meter you fill with tricks, rail balance, legs that soak up bumps, and landings graded PERFECT, clean or SKETCHY.
- **Physics:** real gravity (9.81 m/s²) on every jump, snow friction and air drag that grows with speed (tuck to cut it), carves limited by edge grip, and landings that keep the part of your speed along the slope. On the in-run to a jump you ease off gently over the last 70 m to the speed the jump is built for, so you get a full arc into the sweet spot of its landing; too slow, and you tuck and pump up to the speed it needs. Boosting skips the easing, so a boosted send is all yours. An ollie with a rail ahead is sized so you come down onto it.
- **Extras:** 10 outfits, glowing snowflake tokens to collect, a generative soundtrack, and settings for graphics, frame rate, music, sound and camera.
- **Smooth frame rate:** the course is built 50 m at a time in a background thread (a Web Worker running the same world code with the same seed), so new parts of the mountain never hold up a frame. The frame rate is capped at 30, 60 or 90 FPS (60 to start with).
- **No installs, no libraries:** a small hand-written WebGL engine and a plain Node.js server with zero dependencies.

## The course: Pine Valley

A sunny resort run, about 2.5 km long, from the chairlift's top station down into a ski village. The chairlift (with people riding it) runs up beside the piste and crosses right over it twice. Marker poles are coloured like a real piste: blue, red, black on the cat track and moguls, orange in the fun park.

| Section | What's in it |
| --- | --- |
| **Top station** | The run-in from the top of the chairlift. |
| **Blue run** | A wide groomed run with side hits along both edges: lips that lean up toward the trees, banks to slash, and rollers in the middle. |
| **Cat track** | A narrow, flat track with banked walls either side. It's slow, so carry your speed in (and ride the walls). |
| **Mogul field** | Steeper, with staggered bumps all the way across. The mountain restaurant with its sun terrace sits just above it. |
| **Red run** | Steeper again, with more and bigger side hits and a few kickers in the middle. |
| **Fun park** | The resort's little park: four kickers down the middle (small to large) with boxes and rails either side. |
| **Village run** | Down between rows of chalets, under strings of bunting, to the finish and the bottom lift station. |

Stars: **Finish the run**, **Score 10,000** and **Land 6 perfect landings**. Every run builds a fresh course from a seed, or you can ride the same one again against a see-through ghost of your best run.

The other mountains from earlier versions (Gold Medal Slopestyle, the halfpipe, the big-air jumps and the rest) are still in `public/js/world.js`; they're just switched off. To bring one back, add its id to `SS.MAP_IDS` in `world.js` and to `MAPS` in `server.js` (with two or more, the mountain picker and map votes come back by themselves).

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
- **Trick names:** every jump gets its real name, built from your stance, spin direction, flips, rotation and grab, e.g. *BS 540*, *CAB 720* (switch frontside), *SWITCH BS 900*, *BACKFLIP*.
- **Spins:** 180, 360, 540, 720, 900, 1080… The more you rotate, the more points. Riding switch (backwards) adds 10%.
- **Off-axis flips:** flip and spin together for a CORK (backside), RODEO (back flip spun frontside), MISTY (front flip spun frontside) or BIO (front flip spun backside), worth 30% more than a flat spin. Two flips make it a DOUBLE CORK 1080, three a TRIPLE, each extra flip worth more again.
- **Breakdown:** under the trick name the HUD lists where the points came from (spin, flip, grab, airtime, landing), and the combo feed at the top right keeps your last few banked combos.
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
- Every round is on Pine Valley with a fresh seed, so the course is new each round. (With more than one mountain switched on, the mountain changes every round and riders can vote for the next one.)
- Riders who join during the countdown, or in the first 30 seconds of a race, ride the current round. Anyone later watches until the next one starts (← → switches who you watch).
- The race ends when everyone has finished, or after 4 minutes. Highest score wins.
- **Voice chat** goes straight between the riders' browsers (WebRTC, peer to peer); the server only passes along the messages that set up each connection, and only between riders who have voice on. The first time you join, the game asks whether to use your mic. Choose open mic, push-to-talk (hold `V`), or no voice, and tick "don't ask again" to skip the question next time. Settings → Voice chat changes it later (Ask / Off / Push / Open). The voice panel at the bottom left lists who's on voice; a ring lights up while someone talks, and you can mute anyone. The browser asks for mic permission the first time. Voice needs the page on `https` (Render gives you that) or `localhost`.
- **Voice on strict networks:** voice finds a route between riders with a public STUN server. On some school or office networks that isn't enough, and those riders hear nothing. A TURN relay fixes that: set `ICE_SERVERS` (see Settings below) to your TURN server's details.

## Coins, the shop and the cups

Coins are play money that lives with your account on the server. They can't be bought with real money or cashed out; you earn them by riding and spend them on gear.

**Earning coins** (you need an account; guests can still look around the shop and wear the ten free outfits)

| What | Coins |
| --- | --- |
| A new account | 500 to start, plus 25 for every star you already have |
| Finishing a singleplayer run | 10 + 1 for every 150 points, up to 150 a run |
| Each new star (the first time you earn it) | 25 |
| Multiplayer race (at least 2 riders) | 1st 150, 2nd 100, 3rd 60, everyone else who finishes 25 |
| Daily Cup (coming soon) | 1st 1,000, 2nd 600, 3rd 400, 4th–10th 150, everyone who rode it 50 |
| Weekly Cup (coming soon) | 1st 5,000, 2nd 3,000, 3rd 2,000, 4th–10th 600, everyone who rode it 150 |

**The shop** (the Shop tab) sells 10 suits (Candy Cane, Lumberjack plaid, Lava Flow, Arctic Camo, Retro '92, Tiger Stripe, Aurora, Stealth, Midnight Gold, Gold Medal), 7 boards, 7 hats (including silver and gold knit) and 7 goggle lenses, from 250 to 3,000 coins. Tap a card to try it on: your rider appears in a panel on the right wearing it (drag to turn them round), with BUY and then CONFIRM. The pictures on the cards are 3D shots of your own rider wearing each item, made in the game.

**The locker** (the Locker tab) has your rider name, a tile for each slot (rider, suit, board, hat, goggles) showing what you wear, and everything for the slot you pick: the five riders with their stat bars, or tap anything you own to wear it, or a locked one to try it on in the shop. "Stock" in the board, hat and goggles slots means whatever comes with your suit. Everyone can pick any rider; guests can wear the ten free suits.

**The cups** (the Cups tab) are **coming soon**: the tab shows a coming-soon page and the server doesn't start any cups while `CUPS_OPEN` is `false` in `public/js/items.js`. The server side is ready; switching them on also needs a cups page in the lobby again. When they're on, they are one mountain and one course (the same seed) for everyone: the **Daily Cup** runs from midnight to midnight UTC and the **Weekly Cup** from Monday to Monday. Enter as often as you like; your best score counts on the leaderboard. When a cup closes, the server pays the prizes into everyone's account and tells them their place the next time they open the game.

Scores come from the players' browsers, so a determined cheater could fake one; the server checks that runs are real mountains, last at least 15 seconds, come no faster than one every 12 seconds and stay under a sane score.

## Project layout

| File | What it does |
| --- | --- |
| `server.js` | Node server: serves the game, `/api/servers`, `/health`, and the WebSocket rooms |
| `accounts.js` | Accounts: sign up, sign in, sign out, delete, and the saved game per account (`/api/auth/*`, `/api/me`, `/api/save`). Passwords are hashed with scrypt; sign-in attempts are rate limited per IP. Also the coins: the wallet (`/api/wallet`), coins for runs (`/api/run`), buying and wearing gear (`/api/shop/buy`, `/api/locker/equip`), the cups and their payouts (`/api/cups`) |
| `render.yaml` | Render Blueprint (one Starter web service with a 1 GB disk for accounts) |
| `public/index.html` | Page, HUD and menus |
| `public/style.css` | HUD and menu styling |
| `public/js/engine.js` | Tiny WebGL engine: matrices, shaders, drawing |
| `public/js/world.js` | Pine Valley (and the switched-off mountains) and the seeded course: terrain, side hits, cat track, moguls, kickers, rails, chalets, chairlift, trees, mountain ranges. `SS.MAP_IDS` says which mountains are on |
| `public/js/chunks.js` | The background worker that bakes the course's 50 m chunks off the main thread (it loads `engine.js` and `world.js`) |
| `public/js/sculpt.js` | The sculpting kit: soft shapes blended into one surface (signed distance fields), turned into a smooth mesh (surface nets), with clean colour edges and bone weights for skinning |
| `public/js/rider.js` | The five riders (sculpted bodies and heads, the skeleton and its poses and animations, the board and boots), dressed in a free outfit or a look from the locker |
| `public/js/items.js` | Everything you can buy or wear and what it costs (shared by the browser and the server) |
| `public/js/shop.js` | The coins chip, the Shop page with its try-on panel, the Locker page, and the coins line on the results |
| `public/js/game.js` | Physics, tricks, camera, HUD, menus, multiplayer flow |
| `public/js/net.js` | Multiplayer client |
| `public/js/account.js` | The sign in / create account screen, the account chip in the lobby's top bar, and syncing your save |
| `public/js/voice.js` | Voice chat: the mic, a WebRTC connection to each rider on voice, push-to-talk, mute and the talking rings |
| `public/img/maps/` | The picture on each mountain's card (one JPEG per mountain, named after its id; `resort.jpg` is Pine Valley) |
| `public/img/logo.png` | The snowboarder logo (in the lobby rail, on the loading screen and the results); `icon-64.png` and `icon-180.png` are the browser tab and home-screen icons |
| `public/js/audio.js` | Synthesised sound effects |

## Settings

In the game, **Settings** (the gear in the lobby, and in the menu) has Graphics (Low / Medium / High), Frame rate (30 / 60 / 90 FPS, 60 by default), Music, Sound effects, Camera (Chase / Far / High: Chase rides low over your shoulder and pulls back in the air, High hangs up in the sky behind you like a drone), Auto rail (On / Off) and Voice chat (Ask / Off / Push / Open). Low graphics and 30 FPS are the ones to pick on older school computers. 90 FPS needs a screen that runs at 90 Hz or more; on a 60 Hz screen it stays at 60.

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

