import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStroke, describeSpin } from '../src/stroke.js';
import { createBall, simulateUntil } from '../src/physics.js';
import { TABLE, PADDLE } from '../src/constants.js';

const top = TABLE.top;
const paddleZ = TABLE.length / 2 + PADDLE.planeOffset;

// Ball arriving at the human paddle plane, as the AI's return would.
const incoming = (over = {}) => ({
  p: { x: 0, y: top + 0.15, z: paddleZ, ...(over.p || {}) },
  v: { x: 0, y: -0.5, z: 6, ...(over.v || {}) },
  w: { x: 0, y: 0, z: 0, ...(over.w || {}) },
});

function hit(params) {
  const { ball: ballOverrides, ...rest } = params;
  const ball = incoming(ballOverrides);
  const out = computeStroke({ ball, side: 1, mode: 'rally', aimX: 0, lift: 0, pv: { x: 0, y: 0, z: 0 }, ...rest });
  return { ball, out };
}

// Fly the ball until something decisive happens; return the ordered events.
function fly(ball, out) {
  const b = createBall({ p: ball.p, v: out.v, w: out.w });
  const r = simulateUntil(b, (s, ev) => ev.some((e) => ['bounce', 'net', 'endline', 'dead'].includes(e.type)), 3);
  return { events: r.events, ball: b };
}

const first = (events) => events.find((e) => ['bounce', 'net', 'endline', 'dead'].includes(e.type));

test('a default rally shot clears the net and lands on the opponent side', () => {
  const { ball, out } = hit({});
  const f = first(fly(ball, out).events);
  assert.equal(f.type, 'bounce', JSON.stringify(f));
  assert.equal(f.side, -1);
});

test('aimX steers where the ball lands', () => {
  const left = hit({ aimX: -0.45 });
  const right = hit({ aimX: 0.45 });
  const fl = first(fly(left.ball, left.out).events);
  const fr = first(fly(right.ball, right.out).events);
  assert.equal(fl.type, 'bounce');
  assert.equal(fr.type, 'bounce');
  assert.ok(fl.p.x < -0.2, `left landed at x=${fl.p.x}`);
  assert.ok(fr.p.x > 0.2, `right landed at x=${fr.p.x}`);
});

test('a full-power flat shot (no spin) flies long', () => {
  const { ball, out } = hit({ pv: { x: 0, y: 4, z: 0 }, tuning: { spinGain: 0 } });
  assert.ok(out.speed > 12, `speed=${out.speed}`);
  const f = first(fly(ball, out).events);
  assert.ok(f.type === 'endline' || f.type === 'dead', `expected long, got ${JSON.stringify(f)}`);
});

test('the same full-power shot with an upward flick (topspin) dips in', () => {
  const { ball, out } = hit({ pv: { x: 0, y: 4, z: 0 } });
  assert.ok(out.speed > 12, `speed=${out.speed}`);
  assert.ok(out.w.x < -200, `topspin w.x=${out.w.x}`);
  const f = first(fly(ball, out).events);
  assert.equal(f.type, 'bounce', JSON.stringify(f));
  assert.equal(f.side, -1);
});

test('a medium topspin loop and a soft backspin chop both land in', () => {
  for (const pv of [{ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }]) {
    const { ball, out } = hit({ pv });
    const f = first(fly(ball, out).events);
    assert.equal(f.type, 'bounce', `pv=${JSON.stringify(pv)} -> ${JSON.stringify(f)}`);
    assert.equal(f.side, -1);
  }
});

test('a sideways flick produces sidespin that curves the ball', () => {
  const flat = hit({});
  const side = hit({ pv: { x: 3, y: 0, z: 0 }, tuning: { powerGain: 0 } });
  assert.ok(side.out.w.y > 150, `w.y=${side.out.w.y}`);
  const f0 = first(fly(flat.ball, flat.out).events);
  const f1 = first(fly(side.ball, side.out).events);
  assert.equal(f1.type, 'bounce', JSON.stringify(f1));
  assert.ok(f1.p.x < f0.p.x - 0.1, `curved landing x=${f1.p.x} vs flat ${f0.p.x}`);
});

test('incoming topspin pops the return up', () => {
  const plain = hit({});
  const spun = hit({ ball: { w: { x: 300, y: 0, z: 0 } } });
  assert.ok(spun.out.v.y > plain.out.v.y + 0.3, `spun vy=${spun.out.v.y} plain vy=${plain.out.v.y}`);
});

test('a default serve bounces on the server side first, then clears the net and lands in', () => {
  const ball = { p: { x: 0.3, y: top + 0.25, z: paddleZ }, v: { x: 0, y: -1.5, z: 0 }, w: { x: 0, y: 0, z: 0 } };
  const out = computeStroke({ ball, side: 1, mode: 'serve', aimX: 0, lift: 0, pv: { x: 0, y: 0, z: 0 } });
  const b = createBall({ p: ball.p, v: out.v, w: out.w });
  const r = simulateUntil(b, (s, ev) => ev.some((e) => (e.type === 'bounce' && e.side === -1) || ['net', 'endline', 'dead'].includes(e.type)), 3);
  const decisive = r.events.filter((e) => ['bounce', 'net', 'endline', 'dead'].includes(e.type));
  assert.equal(decisive[0]?.type, 'bounce', JSON.stringify(decisive));
  assert.equal(decisive[0]?.side, 1);
  assert.equal(decisive[1]?.type, 'bounce', JSON.stringify(decisive));
  assert.equal(decisive[1]?.side, -1);
});

test('a sidespin serve is still legal', () => {
  const ball = { p: { x: 0.3, y: top + 0.25, z: paddleZ }, v: { x: 0, y: -1.5, z: 0 }, w: { x: 0, y: 0, z: 0 } };
  const out = computeStroke({ ball, side: 1, mode: 'serve', aimX: -0.2, lift: 0, pv: { x: 2.5, y: 0.5, z: 0 } });
  const b = createBall({ p: ball.p, v: out.v, w: out.w });
  const r = simulateUntil(b, (s, ev) => ev.some((e) => (e.type === 'bounce' && e.side === -1) || ['net', 'endline', 'dead'].includes(e.type)), 3);
  const decisive = r.events.filter((e) => ['bounce', 'net', 'endline', 'dead'].includes(e.type));
  assert.deepEqual(decisive.map((e) => `${e.type}:${e.side}`), ['bounce:1', 'bounce:-1'], JSON.stringify(decisive));
});

test('the stroke works mirrored for the AI side', () => {
  const ball = { p: { x: 0, y: top + 0.15, z: -paddleZ }, v: { x: 0, y: -0.5, z: -6 }, w: { x: 0, y: 0, z: 0 } };
  const out = computeStroke({ ball, side: -1, mode: 'rally', aimX: 0, lift: 0, pv: { x: 0, y: 2, z: 0 } });
  assert.ok(out.v.z > 0);
  assert.ok(out.w.x > 100, `AI up-flick is topspin for +z travel: w.x=${out.w.x}`);
  const f = first(fly(ball, out).events);
  assert.equal(f.type, 'bounce', JSON.stringify(f));
  assert.equal(f.side, 1);
});

test('describeSpin classifies by travel direction', () => {
  const towardAI = { x: 0, y: 0, z: -1 };
  assert.equal(describeSpin({ x: -200, y: 0, z: 0 }, towardAI).type, 'topspin');
  assert.equal(describeSpin({ x: 200, y: 0, z: 0 }, towardAI).type, 'backspin');
  assert.equal(describeSpin({ x: 200, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }).type, 'topspin');
  assert.equal(describeSpin({ x: 20, y: 250, z: 0 }, towardAI).type, 'sidespin');
  assert.equal(describeSpin({ x: 5, y: 5, z: 0 }, towardAI).type, 'flat');
  assert.ok(Math.abs(describeSpin({ x: 0, y: 2 * Math.PI * 30, z: 0 }, towardAI).rps - 30) < 1e-9);
});
