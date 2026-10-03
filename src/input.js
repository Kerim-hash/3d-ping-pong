// Pointer -> paddle. The cursor is projected onto the human paddle plane with the live camera,
// so the paddle sits exactly under the pointer. Velocity is estimated over a short window so a
// flick at the moment of impact becomes spin and power.
import * as THREE from '../three.module.js';
import { TABLE } from './constants.js';
import { clamp } from './vec.js';

const WINDOW = 0.07; // seconds of pointer history used for velocity
const REACH = { x: 1.0, yBelow: 0.2, yAbove: 1.0 };

export class PointerInput {
  constructor(element, camera, planeZ) {
    this.element = element;
    this.camera = camera;
    this.planeZ = planeZ;
    this.ndc = new THREE.Vector2(0, -0.3);
    this.position = { x: 0, y: TABLE.top + 0.25 };
    this.velocity = { x: 0, y: 0 };
    this.samples = [];
    this.clicks = 0;
    this.hasPointer = false;
    this.ray = new THREE.Raycaster();

    window.addEventListener('pointermove', (e) => this.onPointer(e));
    window.addEventListener('pointerdown', (e) => {
      this.onPointer(e);
      if (e.target === element) this.clicks += 1;
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.clicks += 1;
      }
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onPointer(e) {
    const rect = this.element.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.hasPointer = true;
  }

  consumeClick() {
    if (this.clicks > 0) {
      this.clicks = 0;
      return true;
    }
    return false;
  }

  /** Project the pointer onto the paddle plane and refresh the velocity estimate. */
  update(now) {
    if (this.hasPointer) {
      this.ray.setFromCamera(this.ndc, this.camera);
      const o = this.ray.ray.origin;
      const d = this.ray.ray.direction;
      if (Math.abs(d.z) > 1e-6) {
        const t = (this.planeZ - o.z) / d.z;
        if (t > 0) {
          this.position.x = clamp(o.x + d.x * t, -REACH.x, REACH.x);
          this.position.y = clamp(o.y + d.y * t, TABLE.top - REACH.yBelow, TABLE.top + REACH.yAbove);
        }
      }
    }
    this.samples.push({ t: now, x: this.position.x, y: this.position.y });
    while (this.samples.length > 2 && now - this.samples[0].t > WINDOW) this.samples.shift();
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = b.t - a.t;
    if (dt > 1e-3) {
      this.velocity.x = (b.x - a.x) / dt;
      this.velocity.y = (b.y - a.y) / dt;
    } else {
      this.velocity.x = 0;
      this.velocity.y = 0;
    }
  }
}
