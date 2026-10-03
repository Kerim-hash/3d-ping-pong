// three.js scene: hall floor, table, net, paddles, ball, spin ring, trail, lights and shadows.
import * as THREE from '../three.module.js';
import { TABLE, NET, PADDLE } from './constants.js';

const COLORS = {
  background: 0x14171e,
  floor: 0x23272f,
  mat: 0x6e2222,
  tableTop: 0x1d4e9e,
  tableSkirt: 0x10203c,
  legs: 0x2b2f36,
  line: 0xf4f4f4,
  wood: 0xc9a46a,
  rubberHuman: 0xd62b2b,
  rubberAi: 0x1e1e22,
  ball: 0xffffff,
  ballMark: 0xf28c28,
};

const VISUAL_BALL_RADIUS = 0.03; // the physics ball is 0.02; a little bigger reads better from 3 m

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#f28c28';
  g.fillRect(0, 56, 256, 16); // equator band
  g.fillRect(60, 0, 14, 128); // meridian band
  g.fillRect(188, 0, 14, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(20,20,24,0.95)';
  g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 6);
  return tex;
}

function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.7, metalness: 0.05 }));
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

function buildTable() {
  const group = new THREE.Group();
  const { width: W, length: L, top, thickness } = TABLE;

  const topMesh = box(W, thickness, L, COLORS.tableTop, { roughness: 0.55 });
  topMesh.position.y = top - thickness / 2;
  group.add(topMesh);

  const lineY = top + 0.0008;
  const lineMat = new THREE.MeshStandardMaterial({ color: COLORS.line, roughness: 0.6 });
  const addLine = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0015, d), lineMat);
    m.position.set(x, lineY, z);
    m.receiveShadow = true;
    group.add(m);
  };
  addLine(0.02, L, -(W / 2 - 0.01), 0);
  addLine(0.02, L, W / 2 - 0.01, 0);
  addLine(W, 0.02, 0, -(L / 2 - 0.01));
  addLine(W, 0.02, 0, L / 2 - 0.01);
  addLine(0.003, L, 0, 0);

  const skirt = box(W + 0.02, 0.08, L + 0.02, COLORS.tableSkirt);
  skirt.position.y = top - thickness - 0.04;
  group.add(skirt);

  const legH = top - thickness - 0.08;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.05, legH, 0.05, COLORS.legs);
      leg.position.set(sx * (W / 2 - 0.18), legH / 2, sz * (L / 2 - 0.35));
      group.add(leg);
    }
    const bar = box(0.04, 0.04, L - 0.7, COLORS.legs);
    bar.position.set(sx * (W / 2 - 0.18), 0.12, 0);
    group.add(bar);
  }
  return group;
}

function buildNet() {
  const group = new THREE.Group();
  const { width: W, top } = TABLE;
  const span = W + 2 * NET.overhang;

  const netMat = new THREE.MeshStandardMaterial({
    map: netTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    roughness: 0.9,
    depthWrite: false,
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(span, NET.height), netMat);
  net.position.set(0, top + NET.height / 2, 0);
  group.add(net);

  const band = box(span, 0.012, 0.005, COLORS.line);
  band.position.set(0, top + NET.height, 0);
  group.add(band);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.4, metalness: 0.5 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, NET.height + 0.06, 16), postMat);
    post.position.set(sx * span / 2, top + (NET.height + 0.06) / 2 - 0.03, 0);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}

function buildPaddle(rubberColor) {
  const group = new THREE.Group();
  const R = PADDLE.radius;
  const rubber = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.014, 48),
    new THREE.MeshStandardMaterial({ color: rubberColor, roughness: 0.85 })
  );
  rubber.rotation.x = Math.PI / 2;
  rubber.castShadow = true;
  group.add(rubber);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.008, 48),
    new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.6 })
  );
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  const handle = box(0.03, 0.1, 0.022, COLORS.wood, { roughness: 0.6 });
  handle.position.y = -R - 0.045;
  group.add(handle);
  return group;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0b0d12');
  grad.addColorStop(0.55, '#171a22');
  grad.addColorStop(1, '#2a2f3b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

export function createScene(container) {
  // Treat hex colors as sRGB and light in linear space (three r139 defaults to the legacy mode,
  // which washes every dark color out once sRGB output encoding is on).
  THREE.ColorManagement.legacyMode = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x2a2f3b, 7, 20);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
  const cameraBase = new THREE.Vector3(0, 1.8, 3.05);
  const lookBase = new THREE.Vector3(0, 0.68, -0.5);
  camera.position.copy(cameraBase);
  camera.lookAt(lookBase);

  scene.add(new THREE.HemisphereLight(0xd6deff, 0x2a2d35, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(1.6, 5.5, 2.4);
  sun.target.position.set(0, TABLE.top, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 14;
  sun.shadow.camera.left = -2.6;
  sun.shadow.camera.right = 2.6;
  sun.shadow.camera.top = 2.6;
  sun.shadow.camera.bottom = -2.6;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x9fb4ff, 0.3);
  fill.position.set(-3, 3, -2);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 10), new THREE.MeshStandardMaterial({ color: COLORS.mat, roughness: 0.9 }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = 0.002;
  mat.receiveShadow = true;
  scene.add(mat);

  scene.add(buildTable());
  scene.add(buildNet());

  const paddles = { 1: buildPaddle(COLORS.rubberHuman), [-1]: buildPaddle(COLORS.rubberAi) };
  const planeZ = TABLE.length / 2 + PADDLE.planeOffset;
  paddles[1].position.set(0, TABLE.top + 0.25, planeZ);
  paddles[-1].position.set(0, TABLE.top + 0.25, -planeZ);
  scene.add(paddles[1], paddles[-1]);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(VISUAL_BALL_RADIUS, 32, 24),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 })
  );
  ball.castShadow = true;
  scene.add(ball);

  const spinRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.0035, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
  );
  spinRing.visible = false;
  scene.add(spinRing);

  const TRAIL_N = 28;
  const trailGeom = new THREE.BufferGeometry();
  trailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
  const trail = new THREE.Line(trailGeom, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, cameraBase, lookBase, paddles, ball, spinRing, trail, trailN: TRAIL_N, resize };
}
