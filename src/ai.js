// Computer opponent. Reads the ball by simulating the same physics forward, with a reaction
// delay, a speed limit and a reading error that grows with the incoming spin.
import { TABLE, PADDLE, STROKE, PHYSICS } from './constants.js';
import { cloneBall, stepBall } from './physics.js';
import { clone, length, clamp } from './vec.js';

export const DIFFICULTY = {
  easy: {
    reaction: 0.3, maxSpeed: 2.2, baseErr: 0.07, spinErr: 0.12, tossDelay: 1.4,
    shots: [['flat', 0.6], ['topspin', 0.25], ['backspin', 0.1], ['sidespin', 0.05]],
    power: [0.2, 1.2], aimSpread: 0.3, aimAway: 0,
  },
  normal: {
    reaction: 0.18, maxSpeed: 4.0, baseErr: 0.035, spinErr: 0.09, tossDelay: 1.2,
    shots: [['flat', 0.35], ['topspin', 0.4], ['backspin', 0.15], ['sidespin', 0.1]],
    power: [0.6, 2.5], aimSpread: 0.45, aimAway: 0.3,
  },
  hard: {
    reaction: 0.1, maxSpeed: 6.5, baseErr: 0.015, spinErr: 0.06, tossDelay: 1.0,
    shots: [['flat', 0.15], ['topspin', 0.5], ['backspin', 0.15], ['sidespin', 0.2]],
    power: [1.5, 3.5], aimSpread: 0.55, aimAway: 0.6,
  },
};

const REACH = { x: 1.1, yBelow: 0.15, yAbove: 0.9 };

/**
 * Where (x, y) and when the ball will cross the plane z = planeZ, using the real physics.
 * Returns null if it never gets there (net, floor, timeout). Does not touch `ball`.
 */
export function predictIntercept(ball, planeZ, maxTime = 3) {
  const s = cloneBall(ball);
  const dt = PHYSICS.substep;
  let prev = clone(s.p);
  let t = 0;
  while (t < maxTime) {
    stepBall(s, dt);
    t += dt;
    if (s.dead) return null;
    if ((planeZ - prev.z) * (planeZ - s.p.z) <= 0 && s.p.z !== prev.z) {
      const f = (planeZ - prev.z) / (s.p.z - prev.z);
      return {
        p: { x: prev.x + (s.p.x - prev.x) * f, y: prev.y + (s.p.y - prev.y) * f },
        time: t - dt + f * dt,
        v: clone(s.v),
        w: clone(s.w),
      };
    }
    prev = clone(s.p);
  }
  return null;
}

export class AIPlayer {
  constructor({ difficulty = 'normal', side = -1, rng = Math.random } = {}) {
    this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficulty = difficulty;
    this.side = side;
    this.rng = rng;
    this.planeZ = side * (TABLE.length / 2 + PADDLE.planeOffset);
    this.ready = { x: 0, y: TABLE.top + 0.25 };
    this.paddle = { ...this.ready };
    this.velocity = { x: 0, y: 0 };
    this.target = null;
    this.sinceLook = Infinity;
  }

  gaussian() {
    const u1 = Math.max(1e-9, this.rng());
    const u2 = this.rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  pick(lo, hi) {
    return lo + (hi - lo) * this.rng();
  }

  /** Reading error in meters for this ball: more spin, more misjudgement. */
  predictionError(ball) {
    const spin = clamp(length(ball.w) / STROKE.spinCap, 0, 1);
    return this.gaussian() * (this.cfg.baseErr + this.cfg.spinErr * spin);
  }

  servePosition() {
    return { x: -0.2 * this.side, y: TABLE.top + 0.3 };
  }

  update(dt, ball, match) {
    const towardMe = Math.sign(ball.v.z) === Math.sign(this.side);
    const incoming = match.phase === 'rally' && towardMe && match.lastHitter === -this.side;
    let target;
    if (incoming) {
      this.sinceLook += dt;
      if (!this.target || this.sinceLook >= this.cfg.reaction) {
        this.sinceLook = 0;
        const pred = predictIntercept(ball, this.planeZ);
        if (pred) {
          this.target = {
            x: pred.p.x + this.predictionError(ball),
            y: pred.p.y + this.predictionError(ball) * 0.6,
          };
        }
      }
      target = this.target || this.ready;
    } else {
      this.target = null;
      this.sinceLook = Infinity;
      const myServe = match.phase === 'serve' && match.server === this.side;
      target = myServe ? this.servePosition() : this.ready;
    }
    this.moveToward(target, dt);
  }

  moveToward(target, dt) {
    const dx = target.x - this.paddle.x;
    const dy = target.y - this.paddle.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = this.cfg.maxSpeed * dt;
    if (dist <= maxStep) {
      this.velocity = dt > 0 ? { x: dx / dt, y: dy / dt } : { x: 0, y: 0 };
      this.paddle.x = target.x;
      this.paddle.y = target.y;
    } else {
      const f = maxStep / dist;
      this.velocity = { x: dx / dist * this.cfg.maxSpeed, y: dy / dist * this.cfg.maxSpeed };
      this.paddle.x += dx * f;
      this.paddle.y += dy * f;
    }
    this.paddle.x = clamp(this.paddle.x, -REACH.x, REACH.x);
    this.paddle.y = clamp(this.paddle.y, TABLE.top - REACH.yBelow, TABLE.top + REACH.yAbove);
  }

  pickShotType() {
    let u = this.rng();
    for (const [type, weight] of this.cfg.shots) {
      if (u < weight) return type;
      u -= weight;
    }
    return this.cfg.shots[0][0];
  }

  /** Stroke inputs for a rally return. `opponentX`: where the human paddle is, to aim away. */
  chooseShot(ball, { opponentX = 0 } = {}) {
    const type = this.pickShotType();
    const power = this.pick(this.cfg.power[0], this.cfg.power[1]);
    const spread = this.cfg.aimSpread;
    let aimX = this.pick(-spread, spread);
    if (this.cfg.aimAway > 0 && Math.abs(opponentX) > 0.05) {
      aimX = aimX * (1 - this.cfg.aimAway) + (-Math.sign(opponentX) * spread) * this.cfg.aimAway;
    }
    let pv = { x: 0, y: 0, z: 0 };
    let tuning;
    if (type === 'flat') {
      pv = { x: 0, y: Math.min(power, 1.4), z: 0 };
      tuning = { spinGain: 15 };
    } else if (type === 'topspin') {
      pv = { x: 0, y: power, z: 0 };
    } else if (type === 'backspin') {
      pv = { x: 0, y: -Math.min(power, 1.0), z: 0 };
    } else {
      const px = Math.min(power, 2.0) * (this.rng() < 0.5 ? -1 : 1);
      pv = { x: px, y: 0.8, z: 0 };
      // the ball curves toward -side*sign(px)... compensate the aim against the curve
      aimX += Math.sign(px) * this.side * -0.15 * Math.abs(px);
    }
    return { pv, aimX: clamp(aimX, -0.6, 0.6), lift: 0, tuning };
  }

  chooseServe() {
    const type = this.pickShotType();
    const power = this.pick(this.cfg.power[0], this.cfg.power[1]);
    let pv = { x: 0, y: 0, z: 0 };
    if (type === 'topspin') pv = { x: 0, y: Math.min(power, 2), z: 0 };
    else if (type === 'backspin') pv = { x: 0, y: -Math.min(power, 1.5), z: 0 };
    else if (type === 'sidespin') pv = { x: Math.min(power, 2.5) * (this.rng() < 0.5 ? -1 : 1), y: 0.3, z: 0 };
    return { pv, aimX: this.pick(-0.4, 0.4), lift: 0 };
  }
}
