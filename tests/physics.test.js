import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBall, stepBall, simulateUntil } from '../src/physics.js';
import { TABLE, BALL, NET, PHYSICS } from '../src/constants.js';

const top = TABLE.top;
const dt = PHYSICS.substep;

function run(state, seconds) {
  const events = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) events.push(...stepBall(state, dt));
  return events;
}

test('gravity pulls a resting ball down', () => {
  const b = createBall({ p: { x: 0, y: top + 1, z: 0.5 } });
  run(b, 0.1);
  assert.ok(b.v.y < -0.9 && b.v.y > -1.0, `vy=${b.v.y}`);
  assert.ok(b.p.y < top + 1);
});

test('drag never increases speed in free flight', () => {
  const b = createBall({ p: { x: 0, y: top + 0.5, z: 0 }, v: { x: 0, y: 0, z: -10 } });
  const before = Math.abs(b.v.z);
  stepBall(b, dt);
  assert.ok(Math.abs(b.v.z) < before);
});

test('topspin (w.x < 0 for travel toward -z) makes the ball dip faster than no spin', () => {
  const flat = createBall({ p: { x: 0, y: top + 0.5, z: 0 }, v: { x: 0, y: 0, z: -8 } });
  const top_ = createBall({ p: { x: 0, y: top + 0.5, z: 0 }, v: { x: 0, y: 0, z: -8 }, w: { x: -200, y: 0, z: 0 } });
  stepBall(flat, dt);
  stepBall(top_, dt);
  assert.ok(top_.v.y < flat.v.y, `topspin vy=${top_.v.y} flat vy=${flat.v.y}`);
});

test('sidespin w.y > 0 curves a ball travelling -z toward -x', () => {
  const b = createBall({ p: { x: 0, y: top + 0.5, z: 0 }, v: { x: 0, y: 0, z: -8 }, w: { x: 0, y: 200, z: 0 } });
  stepBall(b, dt);
  assert.ok(b.v.x < 0, `vx=${b.v.x}`);
});

test('table bounce reflects vertical velocity with restitution and reports the side', () => {
  const b = createBall({ p: { x: 0, y: top + BALL.radius + 0.001, z: 0.5 }, v: { x: 0, y: -3, z: 0 } });
  const events = run(b, 0.02);
  const bounce = events.find((e) => e.type === 'bounce');
  assert.ok(bounce, 'expected a bounce event');
  assert.equal(bounce.side, 1);
  assert.ok(b.v.y > 0);
  assert.ok(Math.abs(b.v.y - 3 * PHYSICS.restitution) < 0.25, `vy=${b.v.y}`);
  assert.ok(b.p.y >= top + BALL.radius - 1e-9, 'ball must not be left inside the table');
});

test('no bounce when the ball falls past the side of the table', () => {
  const b = createBall({ p: { x: TABLE.width / 2 + 0.1, y: top + BALL.radius + 0.001, z: 0.5 }, v: { x: 0, y: -3, z: 0 } });
  const events = run(b, 0.05);
  assert.ok(!events.some((e) => e.type === 'bounce'));
});

test('topspin bounce kicks the ball forward; backspin never does and survives the bounce', () => {
  const mk = (wx) => createBall({ p: { x: 0, y: top + BALL.radius + 0.001, z: -0.5 }, v: { x: 0, y: -3, z: -5 }, w: { x: wx, y: 0, z: 0 } });
  const topspin = mk(-300);
  const backspin = mk(300);
  const none = mk(0);
  run(topspin, 0.01);
  run(backspin, 0.01);
  run(none, 0.01);
  assert.ok(Math.abs(topspin.v.z) > Math.abs(none.v.z) + 1, `topspin vz=${topspin.v.z} flat=${none.v.z}`);
  assert.ok(Math.abs(backspin.v.z) <= Math.abs(none.v.z) + 0.05, `backspin vz=${backspin.v.z} flat=${none.v.z}`);
  assert.ok(backspin.w.x > 100, `backspin keeps backspin, w.x=${backspin.w.x}`);
  assert.ok(none.w.x < 0, `a flat ball picks up topspin from the table, w.x=${none.w.x}`);
});

test('a low ball hits the net and is thrown back, damped', () => {
  const b = createBall({ p: { x: 0, y: top + 0.05, z: 0.05 }, v: { x: 0, y: 0, z: -3 } });
  const events = run(b, 0.05);
  assert.ok(events.some((e) => e.type === 'net'));
  assert.ok(b.v.z > 0 && b.v.z < 3, `vz=${b.v.z}`);
});

test('a ball clearing the net height passes without a net event', () => {
  const b = createBall({ p: { x: 0, y: top + NET.height + 0.1, z: 0.05 }, v: { x: 0, y: 0, z: -3 } });
  const events = run(b, 0.05);
  assert.ok(!events.some((e) => e.type === 'net'));
  assert.ok(b.p.z < 0);
});

test('ball below the table surface is reported dead once', () => {
  const b = createBall({ p: { x: 1.5, y: top + 0.01, z: 0 }, v: { x: 0, y: -2, z: 0 } });
  const events = run(b, 0.2);
  assert.equal(events.filter((e) => e.type === 'dead').length, 1);
});

test('crossing the end line away from the net reports endline with the side', () => {
  const b = createBall({ p: { x: 0, y: top + 0.3, z: TABLE.length / 2 - 0.05 }, v: { x: 0, y: 0, z: 4 } });
  const events = run(b, 0.05);
  const e = events.find((ev) => ev.type === 'endline');
  assert.ok(e);
  assert.equal(e.side, 1);
});

test('simulateUntil stops on the predicate and reports time', () => {
  const b = createBall({ p: { x: 0, y: top + 0.6, z: 1 }, v: { x: 0, y: 0, z: -4 } });
  const r = simulateUntil(b, (s) => s.p.z <= 0, 2);
  assert.ok(b.p.z <= 0);
  assert.ok(r.time > 0.2 && r.time < 0.4, `t=${r.time}`);
  assert.equal(r.timedOut, false);
});
