// All units: meters, seconds, kilograms, radians. Y is up.

export const TABLE = {
  length: 2.74,   // along Z
  width: 1.525,   // along X
  top: 0.76,      // height of the playing surface
  thickness: 0.03,
};

export const NET = {
  height: 0.1525,
  overhang: 0.1525, // net extends past the table edge on each side
};

export const BALL = {
  radius: 0.02,
  mass: 0.0027,
  // hollow sphere: I = (2/3) m r^2 -> k = I / (m r^2)
  inertiaFactor: 2 / 3,
};

export const PHYSICS = {
  gravity: 9.81,
  dragCoeff: 0.11,        // kd: a_drag = -kd * |v| * v   (1/m)
  magnusCoeff: 0.0045,    // km: a_magnus = km * (w x v)
  spinDecay: 0.2,         // 1/s
  restitution: 0.88,      // table bounce
  friction: 0.25,         // table/ball sliding friction
  netDamping: { vz: -0.25, vx: 0.6, vy: 0.5, spin: 0.3 },
  deadBelowTable: 0.05,   // ball lower than tableTop - this => dead ball
  substep: 1 / 240,
};

export const PADDLE = {
  radius: 0.09,
  planeOffset: 0.25,      // paddle plane sits this far beyond the end line
  humanAssist: 0.03,
  aiAssist: 0.0,
};

export const STROKE = {
  rally: { base: 5.5, powerGain: 1.6, pvCap: 4, min: 4, max: 14 },
  serve: { base: 4.2, powerGain: 0.8, pvCap: 3, min: 3.5, max: 7 },
  incomingSpeedGain: 0.15,
  depthFrac: { atMin: 0.5, atMax: 1.15, sMin: 4, sMax: 14 },
  serveDepthFrac: 0.45,
  liftDegrees: 12,
  elevationMin: -10,
  elevationMax: 60,
  spinGain: 80,           // rad/s per m/s of paddle brushing speed
  spinKeep: -0.4,         // fraction of incoming spin kept (sign flipped)
  spinCap: 420,
  spinKick: 0.25,         // how much incoming spin deflects the return
};

export const SERVE = {
  tossSpeed: 2.6,
  aiTossDelay: 1.2,
};

export const MATCH = {
  pointsToWin: 11,
};
