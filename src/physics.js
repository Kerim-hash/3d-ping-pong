// Pure ball physics. No three.js here so it runs under node --test and inside the AI predictor.
import { TABLE, NET, BALL, PHYSICS } from './constants.js';
import { vec, clone, add, scale, cross, length, normalize } from './vec.js';

const HALF_L = TABLE.length / 2;
const HALF_W = TABLE.width / 2;

export function createBall({ p, v, w } = {}) {
  return {
    p: p ? clone(p) : vec(0, TABLE.top + 0.3, 0),
    v: v ? clone(v) : vec(),
    w: w ? clone(w) : vec(),
    dead: false,
  };
}

export function cloneBall(b) {
  return { p: clone(b.p), v: clone(b.v), w: clone(b.w), dead: b.dead };
}

function integrate(s, dt) {
  const speed = length(s.v);
  const magnus = scale(cross(s.w, s.v), PHYSICS.magnusCoeff);
  const drag = scale(s.v, -PHYSICS.dragCoeff * speed);
  const a = add(add(vec(0, -PHYSICS.gravity, 0), drag), magnus);
  s.v = add(s.v, scale(a, dt));
  s.p = add(s.p, scale(s.v, dt));
  s.w = scale(s.w, Math.max(0, 1 - PHYSICS.spinDecay * dt));
}

// Bounce of a spinning hollow sphere on a flat surface with normal +Y.
// Normal: restitution. Tangential: rolling-contact impulse, capped by Coulomb friction.
function applySurfaceBounce(s) {
  const r = BALL.radius;
  const m = BALL.mass;
  const k = BALL.inertiaFactor;
  const e = PHYSICS.restitution;
  const vnAbs = -s.v.y;
  s.v.y = e * vnAbs;

  const rc = vec(0, -r, 0);
  const vt = vec(s.v.x, 0, s.v.z);
  const u = add(vt, cross(s.w, rc)); // slip velocity of the contact point
  let J = scale(u, -m * k / (1 + k)); // impulse that would stop the slip (pure rolling)
  const jMax = PHYSICS.friction * m * (1 + e) * vnAbs;
  if (length(J) > jMax) J = scale(normalize(u), -jMax); // sliding instead
  s.v = add(s.v, scale(J, 1 / m));
  const I = k * m * r * r;
  s.w = add(s.w, scale(cross(rc, J), 1 / I));
}

function tableBounce(s, prev, events) {
  const r = BALL.radius;
  const surface = TABLE.top + r;
  if (!(s.v.y < 0 && s.p.y < surface && prev.y >= surface)) return;
  const t = (prev.y - surface) / (prev.y - s.p.y);
  const x = prev.x + (s.p.x - prev.x) * t;
  const z = prev.z + (s.p.z - prev.z) * t;
  if (Math.abs(x) > HALF_W + r * 0.5 || Math.abs(z) > HALF_L + r * 0.5) return;
  s.p.x = x;
  s.p.z = z;
  s.p.y = surface + (surface - s.p.y) * PHYSICS.restitution;
  applySurfaceBounce(s);
  events.push({ type: 'bounce', side: z >= 0 ? 1 : -1, p: vec(x, surface, z) });
}

function floorBounce(s) {
  const r = BALL.radius;
  if (s.p.y < r && s.v.y < 0) {
    s.p.y = r;
    s.v.y = -s.v.y * 0.45;
    s.v.x *= 0.8;
    s.v.z *= 0.8;
    s.w = scale(s.w, 0.5);
  }
}

function netCollision(s, prev, events) {
  const crossed = (prev.z > 0 && s.p.z <= 0) || (prev.z < 0 && s.p.z >= 0);
  if (!crossed) return;
  const t = prev.z / (prev.z - s.p.z);
  const y = prev.y + (s.p.y - prev.y) * t;
  const x = prev.x + (s.p.x - prev.x) * t;
  const r = BALL.radius;
  const belowTop = y - r < TABLE.top + NET.height;
  const aboveTable = y > TABLE.top - 0.05;
  const withinWidth = Math.abs(x) < HALF_W + NET.overhang;
  if (!(belowTop && aboveTable && withinWidth)) return;
  const dir = prev.z > 0 ? 1 : -1;
  s.p.x = x;
  s.p.y = y;
  s.p.z = dir * r * 0.5;
  const d = PHYSICS.netDamping;
  s.v.z *= d.vz;
  s.v.x *= d.vx;
  s.v.y *= d.vy;
  s.w = scale(s.w, d.spin);
  events.push({ type: 'net', p: vec(x, y, 0) });
}

function endLine(s, prev, events) {
  const limit = HALF_L + BALL.radius;
  const outNow = Math.abs(s.p.z) >= limit;
  const inBefore = Math.abs(prev.z) < limit;
  if (outNow && inBefore && Math.sign(s.v.z) === Math.sign(s.p.z)) {
    events.push({ type: 'endline', side: s.p.z > 0 ? 1 : -1 });
  }
}

function deadBall(s, events) {
  if (!s.dead && s.p.y < TABLE.top - PHYSICS.deadBelowTable) {
    s.dead = true;
    events.push({ type: 'dead' });
  }
}

/** Advance the ball one substep (mutates state). Returns the events that happened. */
export function stepBall(s, dt = PHYSICS.substep) {
  const events = [];
  const prev = clone(s.p);
  integrate(s, dt);
  tableBounce(s, prev, events);
  netCollision(s, prev, events);
  endLine(s, prev, events);
  deadBall(s, events);
  floorBounce(s);
  return events;
}

/** Step until predicate(state, newEvents) is true or maxTime elapses. */
export function simulateUntil(s, predicate, maxTime = 3, dt = PHYSICS.substep) {
  const events = [];
  let time = 0;
  while (time < maxTime) {
    const ev = stepBall(s, dt);
    events.push(...ev);
    time += dt;
    if (predicate(s, ev, time)) return { events, time, timedOut: false };
  }
  return { events, time, timedOut: true };
}
