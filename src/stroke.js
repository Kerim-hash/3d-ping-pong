// Paddle hit model. Turns "how the paddle met the ball" into an outgoing velocity and spin.
// Pure: no three.js, no DOM. Shared by the human player and the AI.
import { TABLE, NET, BALL, PHYSICS, STROKE } from './constants.js';
import { createBall, simulateUntil } from './physics.js';
import { vec, add, scale, cross, dot, length, normalize, clamp } from './vec.js';

const DEG = Math.PI / 180;
const HALF_L = TABLE.length / 2;
const NET_TOP = TABLE.top + NET.height;

function mergeTuning(tuning = {}) {
  const t = {
    ...STROKE,
    ...tuning,
    rally: { ...STROKE.rally, ...(tuning.rally || {}) },
    serve: { ...STROKE.serve, ...(tuning.serve || {}) },
  };
  if ('powerGain' in tuning) {
    t.rally.powerGain = tuning.powerGain;
    t.serve.powerGain = tuning.powerGain;
  }
  return t;
}

function outgoingSpeed(mode, pv, vIn, t) {
  const cfg = t[mode];
  const brushing = Math.min(length(pv), cfg.pvCap);
  const s = cfg.base + cfg.powerGain * brushing + t.incomingSpeedGain * length(vIn);
  return clamp(s, cfg.min, cfg.max);
}

function rallyDepth(speed, side, t) {
  const d = t.depthFrac;
  const f = clamp((speed - d.sMin) / (d.sMax - d.sMin), 0, 1);
  return -side * HALF_L * (d.atMin + (d.atMax - d.atMin) * f);
}

// Drag-free launch angle through (dist, dh) at `speed` under gravity g. Lower solution.
function launchAngle(speed, dist, dh, g = PHYSICS.gravity) {
  const s2 = speed * speed;
  const disc = s2 * s2 - g * (g * dist * dist + 2 * dh * s2);
  if (disc < 0) return 45 * DEG;
  return Math.atan((s2 - Math.sqrt(disc)) / (g * dist));
}

// Spin component that acts like topspin for horizontal travel `dir` (positive = topspin).
function topspinAmount(w, dir) {
  return dot(w, cross(vec(0, 1, 0), normalize(vec(dir.x, 0, dir.z))));
}

function spinFromStroke(ball, pv, n, t) {
  const pvT = add(pv, scale(n, -dot(pv, n)));
  let w = add(scale(ball.w, t.spinKeep), scale(cross(pvT, n), t.spinGain));
  const wl = length(w);
  if (wl > t.spinCap) w = scale(w, t.spinCap / wl);
  return w;
}

// Incoming spin drags the ball along the rubber: topspin pops up, sidespin shoves sideways.
function spinKick(ball, n, t) {
  const contact = scale(n, -BALL.radius); // contact point faces the paddle
  const slip = cross(ball.w, contact);
  const slipT = add(slip, scale(n, -dot(slip, n)));
  return scale(slipT, -t.spinKick);
}

function velocityAt(elev, speed, dir, kick) {
  return add(scale(add(scale(dir, Math.cos(elev)), vec(0, Math.sin(elev), 0)), speed), kick);
}

// Estimated ball height when it reaches the net plane, with quadratic drag and Magnus-as-gravity.
function heightAtNet(p, v, gEff) {
  const vh = Math.hypot(v.x, v.z);
  const distToNet = Math.abs(p.z) * vh / Math.max(1e-6, Math.abs(v.z));
  const kd = PHYSICS.dragCoeff;
  const tNet = (Math.exp(kd * distToNet) - 1) / (kd * vh);
  return p.y + v.y * tNet - 0.5 * gEff * tNet * tNet;
}

function rallyStroke({ ball, side, aimX, lift, speed, w, kick, n, t }) {
  const target = vec(aimX, TABLE.top, rallyDepth(speed, side, t));
  const flat = vec(target.x - ball.p.x, 0, target.z - ball.p.z);
  const dist = Math.max(0.05, length(flat));
  const dir = normalize(flat);

  const gEff = Math.max(2, PHYSICS.gravity + PHYSICS.magnusCoeff * topspinAmount(w, dir) * speed);
  const needY = NET_TOP + BALL.radius + t.netMargin;
  const distToNet = Math.abs(ball.p.z) / Math.max(1e-6, Math.abs(dir.z));

  let elev = launchAngle(speed, dist, TABLE.top - ball.p.y) + lift * t.liftDegrees * DEG;
  elev = Math.max(elev, launchAngle(speed, distToNet, needY - ball.p.y, gEff));
  elev = clamp(elev, t.elevationMin * DEG, t.elevationMax * DEG);

  let v = velocityAt(elev, speed, dir, kick);
  const maxElev = t.elevationMax * DEG;
  while (elev < maxElev && heightAtNet(ball.p, v, gEff) < needY) {
    elev = Math.min(maxElev, elev + 0.5 * DEG);
    v = velocityAt(elev, speed, dir, kick);
  }
  return { v, w, speed, elevation: elev };
}

// Serve: the ball must bounce on the server's side, clear the net and land in. The server
// "knows how to serve": scan launch angles with the real physics and keep the best legal one.
function serveStroke({ ball, side, aimX, speed, w, kick, t }) {
  const dir = normalize(vec(aimX - ball.p.x, 0, -ball.p.z));
  const wantLand = -side * HALF_L * t.serveLandFrac;
  let best = null;
  for (let deg = -45; deg <= 20; deg += 1.5) {
    const elev = deg * DEG;
    const v = velocityAt(elev, speed, dir, kick);
    const b = createBall({ p: ball.p, v, w });
    const seq = [];
    let clearance = Infinity;
    let prevZ = b.p.z;
    simulateUntil(b, (s, ev) => {
      if (Math.sign(prevZ) !== Math.sign(s.p.z)) clearance = Math.min(clearance, s.p.y - BALL.radius - NET_TOP);
      prevZ = s.p.z;
      for (const e of ev) if (['bounce', 'net', 'endline', 'dead'].includes(e.type)) seq.push(e);
      return seq.length >= 2 || ev.some((e) => e.type !== 'bounce');
    }, 2.5, 1 / 120);
    const legal = seq.length === 2 && seq[0].type === 'bounce' && seq[0].side === side && seq[1].type === 'bounce' && seq[1].side === -side;
    const ownFirst = seq.length >= 1 && seq[0].type === 'bounce' && seq[0].side === side;
    let score = legal ? 10 : ownFirst ? 0 : -10;
    if (legal) {
      score -= Math.abs(seq[1].p.z - wantLand);
      if (clearance < 0.04) score -= 1;
    }
    if (!best || score > best.score) best = { score, v, elev };
  }
  return { v: best.v, w, speed, elevation: best.elev };
}

/**
 * @param {object} args
 * @param {{p,v,w}} args.ball   ball state at contact
 * @param {1|-1} args.side      hitter side (+1 human end, -1 AI end)
 * @param {'rally'|'serve'} args.mode
 * @param {number} args.aimX    world x the shot is aimed at
 * @param {number} args.lift    -1..1 extra loft (ball above paddle center = positive)
 * @param {{x,y,z}} args.pv     paddle velocity at contact
 * @param {object} [args.tuning] overrides for STROKE constants (tests, AI flavors)
 */
export function computeStroke({ ball, side, mode = 'rally', aimX = 0, lift = 0, pv = vec(), tuning = {} }) {
  const t = mergeTuning(tuning);
  const n = vec(0, 0, -side); // toward the opponent
  const speed = outgoingSpeed(mode, pv, ball.v, t);
  const w = spinFromStroke(ball, pv, n, t);
  const kick = spinKick(ball, n, t);
  const args = { ball, side, aimX, lift, speed, w, kick, n, t };
  return mode === 'serve' ? serveStroke(args) : rallyStroke(args);
}

/** Human-readable spin for the HUD, relative to the ball's horizontal travel direction. */
export function describeSpin(w, travel) {
  const total = length(w);
  const rps = total / (2 * Math.PI);
  if (total < 30) return { type: 'flat', rps };
  const topAmount = topspinAmount(w, travel);
  const sideAmount = w.y;
  if (Math.abs(sideAmount) > Math.abs(topAmount)) return { type: 'sidespin', rps };
  return { type: topAmount > 0 ? 'topspin' : 'backspin', rps };
}
