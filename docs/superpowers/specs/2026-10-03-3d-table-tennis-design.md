# 3D Table Tennis — design spec

Date: 2026-10-03. Status: approved by assumption (autonomous session; the user asked for
"real 3D feel, physics, cursor control, spin tricks" and could not answer follow-ups).

## Intent (what the user asked for)

The current project renders 3D meshes but plays as flat 2D Pong (vertical board, paddles slide
up/down, puck reflects). The user wants:

1. The game to *play* as 3D table tennis: horizontal table, ball flies over the net, bounces.
2. Real physics: gravity, air drag, bounce, and spin (Magnus curve, spin-dependent bounce).
3. Cursor control: the paddle follows the mouse/touch pointer.
4. Spin and trick shots: the way you move the cursor at impact decides topspin, backspin,
   sidespin, power.

Assumptions made (correct me if wrong):
- Single player vs computer opponent, with Easy / Normal / Hard.
- Standard-ish rules: first to 11, win by 2, serve changes every 2 points (every point from 10-10).
  No "let" serves, no second serve. Volleys are impossible by construction (see Rules).
- English UI text; no build step; keep the local `three.module.js` (r139) and Live Server workflow.
- OrbitControls and the CDN scripts go away: the pointer is now the paddle, the camera is fixed.

## Units and coordinates

Meters, seconds, three.js Y-up. Table center is the origin, table top at y = 0.76.
Table 2.74 (Z, length) × 1.525 (X, width). Net on the plane z = 0, height 0.1525.
Player side is +Z (camera behind the player). Opponent (AI) side is −Z.
Ball radius 0.02 m, mass 2.7 g, hollow sphere (I = 2/3 m r²).

## Architecture (ES modules, no bundler)

```
index.html / index.css      HUD, start overlay, canvas container
main.js                     entry: builds Game
src/constants.js            table/ball/physics/gameplay tuning numbers
src/vec.js                  tiny {x,y,z} vector helpers (no three.js dependency)
src/physics.js   (pure)     ball step: gravity, drag, Magnus, table bounce w/ spin friction,
                            net collision, dead-ball detection. Emits events.
src/stroke.js    (pure)     paddle hit model: (aim, lift, paddle velocity, incoming ball) ->
                            outgoing velocity + spin. Serve and rally modes. Spin classifier.
src/rules.js     (pure)     Match state machine: serve order, legal bounce tracking, scoring.
src/ai.js        (pure-ish) opponent: predicts intercept by simulating physics.js, moves paddle
                            with speed/reaction/error per difficulty, chooses shots.
src/input.js                pointer -> world point on the paddle plane (raycast), velocity estimate
src/scene.js                three.js scene: table, net, floor, lights+shadows, paddles, ball, trail
src/hud.js                  DOM score / messages / spin readout / start overlay
src/audio.js                tiny WebAudio "pock" sounds
src/game.js                 orchestration: fixed-step loop, serve flow, hit detection, sync meshes
tests/*.test.js             node --test for physics, stroke, rules, ai prediction
```

Pure modules never import three.js, so they run under `node --test`.

## Physics (src/physics.js)

State: `{ p, v, w }` position, velocity, angular velocity (rad/s). `stepBall(state, dt, env)`
integrates one substep (semi-implicit Euler, dt = 1/240 s) and returns a list of events.

Acceleration: `a = g − kd·|v|·v + km·(w × v)`.
- g = (0, −9.81, 0)
- kd = 0.5·ρ·Cd·A / m ≈ 0.11 1/m (ρ=1.2, Cd=0.4, A=πr², m=0.0027)
- km = Magnus coefficient ≈ 0.0045 (slightly exaggerated vs. physical ~0.0034 for gameplay)
- spin decays by `exp(−0.2·dt)`.

Table bounce: when the ball center crosses below `tableTop + r` while inside the table
rectangle and moving down:
- normal: `vy' = −e·vy`, e = 0.88.
- tangential, rolling-contact model with hollow-sphere inertia (k = I/(m r²) = 2/3):
  slip `u = v_t + w × r_c` (r_c = (0,−r,0) contact offset).
  Rolling impulse `J = −u·m·k/(1+k)`; if `|J| > μ·m·(1+e)·|vy|` (μ = 0.25) use sliding impulse
  `J = −μ·m·(1+e)·|vy|·û`. Then `v_t += J/m`, `w += (r_c × J)/I`.
  Effect: topspin kicks forward and lower, backspin checks/floats, sidespin kicks sideways.
- event `{type:'bounce', side:+1|-1}` (sign of z).

Net: segment crossing of plane z = 0 between previous and current position with the crossing
point's y below `tableTop + netHeight + r` and |x| < tableWidth/2 + 0.15. Response: `vz *= −0.25`,
`vx *= 0.6`, `vy *= 0.5`, `w *= 0.3`; event `{type:'net'}`.

Dead ball: y < tableTop − 0.05 → event `{type:'dead'}` (ball cannot bounce on the table any more).
End line: ball center crosses z = ±(L/2 + r) travelling away from the net → `{type:'endline', side}`.

## Stroke model (src/stroke.js)

Inputs: ball state at contact, hitter side (+1/−1), `mode` ('rally' | 'serve'), `aimX` (world x the
shot is aimed at), `lift` (−1…1, extra loft), paddle velocity `pv` (m/s, tangential), power scale.

Outgoing speed: `s = clamp(base + powerGain·min(|pv|, pvCap) + 0.15·|v_in|, sMin, sMax)`;
rally: base 5.5, gain 1.6, cap 4 → 4…14 m/s. Serve: base 6.0, gain 0.5, cap 3 → 5.8…7.5
(slower serves cannot clear the net after the friction of the first bounce).

Rally target point: `(aimX, tableTop, −side·L/2·depthFrac(s))` with `depthFrac` linear from 0.5
at s=4 to 1.15 at s=14 (hard flat shots are aimed long; topspin is what brings them back in).

Rally launch elevation: the drag-free projectile angle to the target at speed s (lower solution,
45° if unreachable) `+ lift·12°`, but never below the angle that clears the net top by 8 cm.
The net-clearance estimate uses quadratic drag and treats the Magnus force of the outgoing spin as
extra gravity, so topspin loops are lifted enough not to net while flat hard shots still fly long.
Clamp −10°…60°.

Serve: the ball must bounce on the server's side, clear the net and land in. The stroke scans
launch angles (−42.5°…15°) and a lateral aim correction (±0.6 m, for the sidespin curve) with the
real physics, coarse pass then refinement, and keeps the best legal trajectory (landing near 55 %
of the receiver's half, net clearance ≥ 6 cm preferred). ~1–6 ms per serve.

Spin: `w_out = −0.4·w_in + spinGain·(pv_t × n)` with n = direction toward the opponent,
spinGain = 80 rad/s per m/s, |w| capped at 420 rad/s. Up-flick ⇒ topspin, down ⇒ backspin,
sideways ⇒ sidespin. Incoming spin also "kicks" the return: `v += −0.25·(w_in × r_c)_t` where
r_c = r·n is the contact offset (topspin incoming pops the return up, sidespin pushes it sideways).

Player mapping (game.js): `aimX = paddle.x·0.5 + (dx/R)·0.6`, `lift = dy/R`, where (dx, dy) is the
ball offset from the paddle center at contact and R the paddle radius (0.09). `pv` = pointer
velocity on the paddle plane, smoothed over the last 60 ms.

Classifier `describeSpin(w, travelDir)` → 'topspin' | 'backspin' | 'sidespin' | 'flat' + rps, for HUD.

## Rules (src/rules.js)

`Match({ pointsToWin: 11 })`. Players `+1` (human) and `−1` (AI). State: `scores`, `server`,
`phase` ('serve' | 'rally' | 'point' | 'over'), `lastHitter`, `needBounceOn` (side that must
receive the next bounce, or null), `winner`.

Events in → outcome:
- `hit(side)` during 'serve' (server only): `lastHitter=side`, `needBounceOn=side`, phase 'rally'.
- `hit(side)` during 'rally': legal only if `needBounceOn===null && lastHitter!==side`
  (ball bounced on my side, now I return). Then `lastHitter=side`, `needBounceOn=−side`.
  Game.js only *allows* the paddle to connect when `canHit(side)` is true.
- `bounce(side)`: if `needBounceOn===side` → ok; after a serve bounce on own side set
  `needBounceOn=−side`, otherwise `null`. If `needBounceOn===null` (second bounce on receiver's
  side) → point to `lastHitter`. If `needBounceOn===−side` (wrong side, e.g. net dribble) → point
  to `−lastHitter`.
- `endline(side)`: if `needBounceOn===side` → the shot was long → point to `side`. Else ignore.
- `dead()`: if `needBounceOn!==null` → hitter faulted → point to `−lastHitter`; else the receiver
  failed → point to `lastHitter`.
- Point award updates score, server rotation (every 2 points, every 1 at ≥10-10), phase 'point',
  then `nextPoint()` → 'serve' or 'over' (≥11 and lead ≥2). Returns a reason string for the HUD.

Because paddle planes sit 0.25 m beyond the end lines, a ball reaching a paddle without the
required bounce has already triggered `endline` → there are no volleys to adjudicate.

## Serve flow (game.js)

Phase 'serve': ball is held at the server's paddle (follows it). Human: click/tap (or Space)
tosses the ball straight up (vy = 2.6). AI: auto-toss after ~1.2 s. While tossed, if the ball is
descending and its (x, y) is within the paddle disc (+ 0.02 assist) → stroke in 'serve' mode.
If the toss falls below the paddle plane without a hit, re-hold the ball (no penalty, hint shown).

## Hit detection (game.js)

Per substep: if the ball crossed the hitter's paddle plane z = side·(L/2 + 0.25) moving toward
the hitter, interpolate (x, y) at the crossing; if within `paddleR + ballR + assist` of the paddle
center and `match.canHit(side)` → apply stroke at the crossing point. Assist: human 0.03 m.

## AI (src/ai.js)

Every `reaction` seconds (Easy 0.28, Normal 0.18, Hard 0.1) while the ball travels toward it, the AI
simulates `physics.stepBall` forward (same code, cloned state) to find where the ball crosses its
paddle plane, then adds aim error `N(0, σ)` with σ = baseErr + spinErr·|w|/420 (Normal: 0.03 +
0.07). It moves its paddle toward the predicted point at max speed (Easy 2.5, Normal 4, Hard 6.5
m/s). Shot choice per difficulty: mix of flat / topspin / backspin / sidespin expressed as a
synthetic `pv`, `aimX` picked randomly within the court (± error). Serve: picks a spot and a spin.
Because the stroke model applies the incoming-spin kick to the AI too, heavy player spin genuinely
makes the AI miss more.

## Presentation (src/scene.js, hud, audio)

- Camera: perspective 50°, at (0, 1.8, 3.05) looking at (0, 0.68, −0.5); eases ±0.12 m in x with
  the paddle for parallax. `ColorManagement.legacyMode = false` so hex colors are sRGB.
- Table: blue top with white edge/center lines, dark legs; net with posts (semi-transparent mesh
  texture); red hall mat on a dark floor, gradient sky, fog; directional light with shadow map
  (2048) + hemisphere light. The ball's shadow is the main depth cue.
- Ball: white sphere (drawn at r = 0.03 for legibility) with an orange two-band canvas texture so
  spin is visible; mesh orientation integrates `w`. A ring around the ball shows the spin axis,
  colored red (topspin) / blue (backspin) / yellow (sidespin), opacity by spin rate. Short trail
  (line, last 28 positions).
- Paddles: red rubber disc (human), black disc (AI), wooden handle; tilts slightly with velocity.
- HUD: scores, server dot, difficulty overlay (start / restart), center messages
  ("OUT", "NET", "MISS", "DOUBLE BOUNCE", "POINT"), spin readout after each human hit
  ("TOPSPIN 31 rps · 42 km/h"), help line. Audio: short filtered noise burst on paddle hit, softer on
  table bounce, dull on net.

## Testing

`npm test` → `node --test tests/`.
- physics: Magnus direction (topspin dips, sidespin curves the right way); table bounce
  restitution; topspin bounce increases forward speed, backspin decreases; net collision event;
  endline/dead events; energy never increases without a hit.
- stroke: default rally shot (6 m/s, no spin) clears the net and lands in; 14 m/s flat lands long;
  14 m/s with +3.5 m/s up-flick lands in; serve (default) bounces own side, clears the net, lands
  in; up-flick ⇒ classified topspin, sideways ⇒ sidespin.
- rules: scoring paths (long, net dribble, miss, double bounce), serve rotation incl. deuce,
  win-by-2, canHit gating.
- ai: predicted intercept matches a direct simulation; speed limit; spin raises reading error;
  every difficulty's shot choices land in; serve position/shot legal.
- Rendering smoke (`npm run smoke`, tests/browser/run.py): headless Chrome loads the real page,
  drives 120 s of automated play with synthetic frames, checks for JS errors, hit/point counts and
  a non-empty rendered frame, and saves screenshots (menu, frozen mid-rally, end state).
