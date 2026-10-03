// Orchestration: fixed-step physics, serve flow, paddle hits, rules, AI, visuals and HUD.
import * as THREE from '../three.module.js';
import { TABLE, BALL, PADDLE, PHYSICS, SERVE, MATCH, STROKE } from './constants.js';
import { createBall, stepBall } from './physics.js';
import { computeStroke, describeSpin } from './stroke.js';
import { Match } from './rules.js';
import { AIPlayer, DIFFICULTY } from './ai.js';
import { createScene } from './scene.js';
import { PointerInput } from './input.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { vec, length, normalize, clamp } from './vec.js';

const PLANE_Z = TABLE.length / 2 + PADDLE.planeOffset;
const POINT_PAUSE = 1.6;
const MESSAGES = {
  long: 'LONG',
  net: 'NET',
  miss: 'MISSED',
  'double bounce': 'DOUBLE BOUNCE',
  out: 'OUT',
  'serve fault': 'SERVICE FAULT',
};
const SPIN_COLORS = { topspin: 0xff5a3c, backspin: 0x4fa8ff, sidespin: 0xffd84a, flat: 0xffffff };

export class Game {
  /** @param {HTMLElement} container  @param {{autoLoop?: boolean}} [options] autoLoop=false lets tests call frame(now) by hand */
  constructor(container, { autoLoop = true } = {}) {
    this.autoLoop = autoLoop;
    this.view = createScene(container);
    this.hud = new Hud(document);
    this.audio = new GameAudio();
    this.input = new PointerInput(this.view.renderer.domElement, this.view.camera, PLANE_Z);
    this.state = 'menu';
    this.ball = createBall({ p: vec(0, TABLE.top + 0.25, PLANE_Z - 0.03) });
    this.human = { paddle: { x: 0, y: TABLE.top + 0.25 }, velocity: { x: 0, y: 0 } };
    this.ai = new AIPlayer({ difficulty: 'normal', side: -1 });
    this.match = null;
    this.tossed = false;
    this.serveTimer = 0;
    this.pointTimer = 0;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.ballQuat = new THREE.Quaternion();
    this.trailPoints = [];
    this.lastNet = false;

    this.hud.onStart((difficulty) => this.startMatch(difficulty));
    this.hud.showOverlay('3D TABLE TENNIS', 'Pick a difficulty to start');
    if (this.autoLoop) requestAnimationFrame((t) => this.frame(t));
  }

  startMatch(difficulty) {
    this.ai = new AIPlayer({ difficulty: difficulty in DIFFICULTY ? difficulty : 'normal', side: -1 });
    this.match = new Match({ pointsToWin: MATCH.pointsToWin, firstServer: 1 });
    this.state = 'playing';
    this.hud.hideOverlay();
    this.hud.hideMessage();
    this.hud.setDifficulty(this.ai.difficulty);
    this.hud.setScores(0, 0);
    this.audio.ensure();
    this.beginServe();
  }

  beginServe() {
    this.tossed = false;
    this.serveTimer = 0;
    this.trailPoints.length = 0;
    this.view.trail.visible = false;
    this.ball = createBall({ p: vec(0, TABLE.top + 0.25, PLANE_Z) });
    this.hud.setServer(this.match.server);
    this.hud.setScores(this.match.score(1), this.match.score(-1));
  }

  paddleOf(side) {
    return side === 1 ? this.human.paddle : this.ai.paddle;
  }

  // ---- simulation -------------------------------------------------------------------------

  step(dt) {
    if (this.state !== 'playing') return;
    const match = this.match;
    this.ai.update(dt, this.ball, match);

    if (match.phase === 'serve') this.stepServe(dt);
    else if (match.phase === 'rally') this.stepRally(dt);
    else if (match.phase === 'point') this.stepPointPause(dt);
  }

  stepServe(dt) {
    const side = this.match.server;
    const paddle = this.paddleOf(side);
    const planeZ = side * PLANE_Z;

    if (!this.tossed) {
      // ball rests on the server's paddle
      this.ball.p = vec(paddle.x, paddle.y + 0.01, planeZ - side * 0.035);
      this.ball.v = vec();
      this.ball.w = vec();
      this.ball.dead = false;
      let toss = false;
      if (side === 1) {
        this.hud.setHint('Click or press Space to serve. Flick the mouse as you hit for spin.');
        toss = this.input.consumeClick();
      } else {
        this.hud.setHint('CPU is serving…');
        this.serveTimer += dt;
        toss = this.serveTimer >= this.ai.cfg.tossDelay;
      }
      if (toss) {
        this.tossed = true;
        this.ball.p = vec(paddle.x, paddle.y + 0.02, planeZ);
        this.ball.v = vec(0, SERVE.tossSpeed, 0);
      }
      return;
    }

    stepBall(this.ball, dt); // gravity only matters here; the ball sits in the paddle plane
    const descending = this.ball.v.y < 0;
    const dist = Math.hypot(this.ball.p.x - paddle.x, this.ball.p.y - paddle.y);
    const reach = PADDLE.radius + BALL.radius + (side === 1 ? PADDLE.humanAssist : 0.02);
    if (descending && dist <= reach) {
      this.strike(side, 'serve');
      return;
    }
    if (this.ball.p.y < paddle.y - 0.35 || this.ball.p.y < TABLE.top - 0.1) {
      this.tossed = false; // missed the toss: just pick the ball up again
      this.input.consumeClick();
    }
  }

  stepRally(dt) {
    const prev = { ...this.ball.p };
    const events = stepBall(this.ball, dt);
    const match = this.match;
    let result = null;
    for (const e of events) {
      if (e.type === 'bounce') {
        this.audio.bounce();
        result = result || match.bounce(e.side);
      } else if (e.type === 'net') {
        this.audio.net();
        this.lastNet = true;
      } else if (e.type === 'endline') {
        result = result || match.endline(e.side);
      } else if (e.type === 'dead') {
        result = result || match.dead();
      }
    }
    if (result) {
      this.endPoint(result);
      return;
    }
    for (const side of [1, -1]) {
      if (match.canHit(side) && this.checkPlaneHit(side, prev)) break;
    }
  }

  checkPlaneHit(side, prev) {
    const ball = this.ball;
    if (Math.sign(ball.v.z) !== side) return false;
    const planeZ = side * PLANE_Z;
    const a = prev.z - planeZ;
    const b = ball.p.z - planeZ;
    if (a * b > 0 || a === b) return false;
    const f = a / (a - b);
    const x = prev.x + (ball.p.x - prev.x) * f;
    const y = prev.y + (ball.p.y - prev.y) * f;
    const paddle = this.paddleOf(side);
    const assist = side === 1 ? PADDLE.humanAssist : PADDLE.aiAssist;
    if (Math.hypot(x - paddle.x, y - paddle.y) > PADDLE.radius + BALL.radius + assist) return false;
    ball.p = vec(x, y, planeZ);
    this.strike(side, 'rally');
    return true;
  }

  strike(side, mode) {
    const ball = this.ball;
    const paddle = this.paddleOf(side);
    const dx = ball.p.x - paddle.x;
    const dy = ball.p.y - paddle.y;
    let args;
    if (side === 1) {
      const pv = { x: this.human.velocity.x, y: this.human.velocity.y, z: 0 };
      args = {
        aimX: paddle.x * 0.5 + (dx / PADDLE.radius) * 0.6,
        lift: clamp(dy / PADDLE.radius, -1, 1),
        pv,
      };
    } else {
      args = mode === 'serve' ? this.ai.chooseServe(ball) : this.ai.chooseShot(ball, { opponentX: this.human.paddle.x });
    }
    const out = computeStroke({ ball, side, mode, ...args });
    ball.v = out.v;
    ball.w = out.w;
    ball.dead = false;
    ball.p.z = side * PLANE_Z - side * 0.01;
    this.match.hit(side);
    this.lastNet = false;
    this.audio.paddle(out.speed);
    this.hud.setHint('');
    if (side === 1) this.hud.showShot(describeSpin(out.w, out.v), out.speed);
    this.trailPoints.length = 0;
  }

  endPoint(result) {
    const youWon = result.winner === 1;
    const title = this.lastNet && result.reason !== 'long' ? 'NET' : MESSAGES[result.reason] || 'POINT';
    this.hud.showMessage(title, youWon ? 'Your point' : 'CPU point', POINT_PAUSE * 1000 - 100);
    this.hud.setScores(this.match.score(1), this.match.score(-1));
    this.audio.point(youWon);
    this.pointTimer = 0;
    this.lastNet = false;
  }

  stepPointPause(dt) {
    stepBall(this.ball, dt); // let the ball roll away while the message shows
    this.pointTimer += dt;
    if (this.pointTimer < POINT_PAUSE) return;
    this.match.nextPoint();
    if (this.match.phase === 'over') {
      this.state = 'over';
      const you = this.match.score(1);
      const cpu = this.match.score(-1);
      this.hud.setHint('');
      this.hud.showOverlay(this.match.winner === 1 ? 'YOU WIN' : 'CPU WINS', `${you} – ${cpu} · play again?`);
    } else {
      this.beginServe();
    }
  }

  // ---- frame ------------------------------------------------------------------------------

  frame(now) {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    this.input.update(now / 1000);
    this.human.paddle.x = this.input.position.x;
    this.human.paddle.y = this.input.position.y;
    this.human.velocity.x = this.input.velocity.x;
    this.human.velocity.y = this.input.velocity.y;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= PHYSICS.substep && steps < 24) {
      this.step(PHYSICS.substep);
      this.accumulator -= PHYSICS.substep;
      steps += 1;
    }

    this.syncVisuals(dt);
    this.view.renderer.render(this.view.scene, this.view.camera);
    if (this.autoLoop) requestAnimationFrame((t) => this.frame(t));
  }

  syncVisuals(dt) {
    const v = this.view;
    const ball = this.ball;

    v.ball.position.set(ball.p.x, ball.p.y, ball.p.z);
    const spin = length(ball.w);
    if (spin > 1e-3 && dt > 0) {
      const axis = normalize(ball.w);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis.x, axis.y, axis.z), spin * dt);
      this.ballQuat.premultiply(q);
      v.ball.quaternion.copy(this.ballQuat);
    }

    // spin ring: axis of rotation, colored by what the spin does to the ball
    const inFlight = this.match && this.match.phase === 'rally';
    if (inFlight && spin > 30) {
      const axis = normalize(ball.w);
      v.spinRing.visible = true;
      v.spinRing.position.copy(v.ball.position);
      v.spinRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(axis.x, axis.y, axis.z));
      const kind = describeSpin(ball.w, ball.v).type;
      v.spinRing.material.color.setHex(SPIN_COLORS[kind]);
      v.spinRing.material.opacity = 0.35 + 0.5 * clamp(spin / STROKE.spinCap, 0, 1);
    } else {
      v.spinRing.visible = false;
    }

    // trail
    if (inFlight) {
      this.trailPoints.push(ball.p.x, ball.p.y, ball.p.z);
      while (this.trailPoints.length > v.trailN * 3) this.trailPoints.splice(0, 3);
      const attr = v.trail.geometry.attributes.position;
      const n = this.trailPoints.length / 3;
      for (let i = 0; i < v.trailN; i++) {
        const j = Math.min(i, n - 1) * 3;
        attr.setXYZ(i, this.trailPoints[j], this.trailPoints[j + 1], this.trailPoints[j + 2]);
      }
      attr.needsUpdate = true;
      v.trail.visible = n > 2;
    } else {
      v.trail.visible = false;
    }

    // paddles: position plus a little tilt from their motion
    const setPaddle = (side, paddle, vel) => {
      const mesh = v.paddles[side];
      mesh.position.set(paddle.x, paddle.y, side * PLANE_Z);
      mesh.rotation.x = clamp(-vel.y * 0.06, -0.5, 0.5) * side;
      mesh.rotation.y = clamp(vel.x * 0.06, -0.5, 0.5) * side;
    };
    setPaddle(1, this.human.paddle, this.human.velocity);
    setPaddle(-1, this.ai.paddle, this.ai.velocity);

    // camera parallax with the human paddle
    const cam = v.camera;
    const targetX = this.human.paddle.x * 0.12;
    cam.position.x += (v.cameraBase.x + targetX - cam.position.x) * Math.min(1, dt * 6);
    cam.lookAt(v.lookBase.x + targetX * 0.5, v.lookBase.y, v.lookBase.z);
  }
}
