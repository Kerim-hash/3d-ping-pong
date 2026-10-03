import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictIntercept, AIPlayer, DIFFICULTY } from '../src/ai.js';
import { createBall, stepBall, simulateUntil } from '../src/physics.js';
import { computeStroke } from '../src/stroke.js';
import { Match } from '../src/rules.js';
import { TABLE, PADDLE, PHYSICS } from '../src/constants.js';

const top = TABLE.top;
const aiPlane = -(TABLE.length / 2 + PADDLE.planeOffset);
const dt = PHYSICS.substep;
const noNoise = () => 0.25; // Box-Muller with u2 = 0.25 gives exactly zero

// Match state right after the human returned the ball in a rally.
function humanJustHit() {
  const m = new Match({ firstServer: 1 });
  m.hit(1);
  m.bounce(1);
  m.bounce(-1);
  m.hit(-1);
  m.bounce(1);
  m.hit(1);
  return m;
}

// A human loop shot flying toward the AI.
function humanShot(pv = { x: 0, y: 2, z: 0 }) {
  const ball = { p: { x: 0.2, y: top + 0.15, z: TABLE.length / 2 + PADDLE.planeOffset }, v: { x: 0, y: -0.5, z: 6 }, w: { x: 0, y: 0, z: 0 } };
  const out = computeStroke({ ball, side: 1, mode: 'rally', aimX: -0.3, lift: 0, pv });
  return createBall({ p: ball.p, v: out.v, w: out.w });
}

test('predictIntercept matches where the ball really crosses the AI plane', () => {
  const ball = humanShot();
  const pred = predictIntercept(ball, aiPlane);
  assert.ok(pred, 'expected an intercept');
  const sim = createBall(ball);
  let prev = { ...sim.p };
  const r = simulateUntil(sim, (s) => s.p.z <= aiPlane || s.dead, 3);
  assert.equal(r.timedOut, false);
  assert.ok(Math.abs(pred.p.x - sim.p.x) < 0.02, `x ${pred.p.x} vs ${sim.p.x}`);
  assert.ok(Math.abs(pred.p.y - sim.p.y) < 0.02, `y ${pred.p.y} vs ${sim.p.y}`);
  assert.ok(Math.abs(pred.time - r.time) < 0.02, `t ${pred.time} vs ${r.time}`);
  assert.ok(ball.p.z > 1, 'predicting must not mutate the real ball');
});

test('predictIntercept returns null when the ball never reaches the plane', () => {
  const ball = createBall({ p: { x: 0, y: top + 0.05, z: 0.3 }, v: { x: 0, y: 0, z: -2 } }); // into the net
  assert.equal(predictIntercept(ball, aiPlane), null);
});

test('the AI moves its paddle to the predicted intercept in time', () => {
  const ball = humanShot();
  const match = humanJustHit();
  const pred = predictIntercept(ball, aiPlane);
  const ai = new AIPlayer({ difficulty: 'normal', side: -1, rng: noNoise });
  let t = 0;
  while (ball.p.z > aiPlane + 0.05 && t < 3) {
    for (const e of stepBall(ball, dt)) if (e.type === 'bounce') match.bounce(e.side);
    ai.update(dt, ball, match);
    t += dt;
  }
  assert.ok(Math.hypot(ai.paddle.x - pred.p.x, ai.paddle.y - pred.p.y) < 0.03, `paddle ${JSON.stringify(ai.paddle)} pred ${JSON.stringify(pred.p)}`);
});

test('the AI paddle never moves faster than its difficulty allows', () => {
  const ball = humanShot({ x: 4, y: 1, z: 0 });
  const match = humanJustHit();
  const ai = new AIPlayer({ difficulty: 'easy', side: -1, rng: noNoise });
  ai.paddle.x = 0.7;
  let maxStep = 0;
  for (let i = 0; i < 120; i++) {
    const before = { ...ai.paddle };
    stepBall(ball, dt);
    ai.update(dt, ball, match);
    maxStep = Math.max(maxStep, Math.hypot(ai.paddle.x - before.x, ai.paddle.y - before.y) / dt);
  }
  assert.ok(maxStep <= DIFFICULTY.easy.maxSpeed + 1e-6, `moved at ${maxStep} m/s`);
});

test('prediction noise grows with incoming spin', () => {
  const quiet = humanShot({ x: 0, y: 0, z: 0 });
  const spun = humanShot({ x: 0, y: 4, z: 0 });
  const seq = [0.9, 0.9]; // same random draws -> errors scale with sigma only
  const mk = () => new AIPlayer({ difficulty: 'normal', side: -1, rng: () => seq[0] });
  const a = mk();
  const b = mk();
  const ea = a.predictionError(quiet);
  const eb = b.predictionError(spun);
  assert.ok(Math.abs(eb) > Math.abs(ea) * 1.5, `spun err ${eb} vs quiet ${ea}`);
});

test('every difficulty chooses shots that land in when it reads the ball perfectly', () => {
  for (const difficulty of Object.keys(DIFFICULTY)) {
    for (const u of [0.05, 0.3, 0.6, 0.95]) {
      const ai = new AIPlayer({ difficulty, side: -1, rng: () => u });
      const ball = { p: { x: 0.1, y: top + 0.2, z: aiPlane }, v: { x: 0, y: -0.5, z: -6 }, w: { x: 0, y: 0, z: 0 } };
      const shot = ai.chooseShot(ball, { opponentX: 0.3 });
      const out = computeStroke({ ball, side: -1, mode: 'rally', ...shot });
      const b = createBall({ p: ball.p, v: out.v, w: out.w });
      const r = simulateUntil(b, (s, ev) => ev.some((e) => ['bounce', 'net', 'endline', 'dead'].includes(e.type)), 3);
      const first = r.events.find((e) => ['bounce', 'net', 'endline', 'dead'].includes(e.type));
      assert.equal(first.type, 'bounce', `${difficulty} u=${u} shot=${JSON.stringify(shot)} -> ${JSON.stringify(first)}`);
      assert.equal(first.side, 1);
    }
  }
});

test('serve position and serve shot are on the AI side and legal', () => {
  const ai = new AIPlayer({ difficulty: 'hard', side: -1, rng: () => 0.4 });
  const pos = ai.servePosition();
  assert.ok(Math.abs(pos.x) < 0.6 && pos.y > top && pos.y < top + 0.6, JSON.stringify(pos));
  const ball = { p: { x: pos.x, y: pos.y, z: aiPlane }, v: { x: 0, y: -1.5, z: 0 }, w: { x: 0, y: 0, z: 0 } };
  const shot = ai.chooseServe(ball);
  const out = computeStroke({ ball, side: -1, mode: 'serve', ...shot });
  const b = createBall({ p: ball.p, v: out.v, w: out.w });
  const r = simulateUntil(b, (s, ev) => ev.some((e) => (e.type === 'bounce' && e.side === 1) || ['net', 'endline', 'dead'].includes(e.type)), 3);
  const decisive = r.events.filter((e) => ['bounce', 'net', 'endline', 'dead'].includes(e.type)).map((e) => `${e.type}:${e.side}`);
  assert.deepEqual(decisive, ['bounce:-1', 'bounce:1']);
});
