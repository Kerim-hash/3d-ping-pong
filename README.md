# 3D Table Tennis

A browser table-tennis game built on three.js (bundled `three.module.js`, no build step).
The ball obeys real physics (gravity, air drag, Magnus lift from spin, friction on the bounce),
the paddle follows your cursor, and the way you flick the mouse at impact decides the spin.

## Run

Open the folder with VS Code Live Server (configured for port 5503), or:

```sh
npm start          # python http.server on http://localhost:5503
```

ES modules need an http:// origin, so do not open `index.html` from the file system.

## Play

| Action | Effect |
| --- | --- |
| Move the mouse | The paddle follows the cursor on its plane behind the end line. Meet the ball to return it. |
| Flick up as you hit | Topspin: the ball dips, so you can hit harder and it still lands. |
| Flick down | Backspin: slow floating chop that keeps its spin after the bounce. |
| Flick sideways | Sidespin: the ball curves in the air. |
| Hit off-center | Left/right on the paddle angles the shot; high/low on the paddle lofts it. |
| Click or Space | Toss your serve. The paddle hits the ball on its way down. |

First to 11, win by two. Service changes every two points (every point from 10-10).
The coloured ring around the ball shows its spin axis: red topspin, blue backspin, yellow sidespin.

## Code map

```
main.js            entry
src/constants.js   table/ball/physics/gameplay tuning
src/physics.js     ball simulation (pure)
src/stroke.js      paddle hit -> outgoing velocity and spin (pure)
src/rules.js       match state machine (pure)
src/ai.js          opponent: predicts by simulating the physics (pure)
src/input.js       pointer -> paddle plane, velocity estimate
src/scene.js       three.js scene, lights, shadows
src/hud.js         DOM overlay
src/audio.js       synthesized sounds
src/game.js        orchestration
docs/superpowers/specs/  design spec
```

## Tests

```sh
npm test           # node --test: physics, stroke, rules, AI
npm run smoke      # headless Chrome: automated play + screenshots (macOS Chrome path)
```
