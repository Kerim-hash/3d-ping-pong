// Table tennis match rules as a small state machine. Pure: fed by physics events from game.js.
// Sides: +1 (human end, +Z) and -1 (AI end, -Z).

export class Match {
  constructor({ pointsToWin = 11, firstServer = 1 } = {}) {
    this.pointsToWin = pointsToWin;
    this.firstServer = firstServer;
    this.scores = { 1: 0, [-1]: 0 };
    this.server = firstServer;
    this.phase = 'serve'; // 'serve' | 'rally' | 'point' | 'over'
    this.winner = null;
    this.lastResult = null;
    this.resetRally();
  }

  resetRally() {
    this.lastHitter = null;
    this.needBounceOn = null; // side that must receive the next bounce, or null
    this.serving = false;     // true between the serve hit and its first bounce
  }

  score(side) {
    return this.scores[side];
  }

  totalPoints() {
    return this.scores[1] + this.scores[-1];
  }

  canHit(side) {
    if (this.phase === 'serve') return side === this.server;
    if (this.phase === 'rally') return this.needBounceOn === null && this.lastHitter === -side;
    return false;
  }

  /** The paddle of `side` struck the ball. Returns true if the hit was legal and applied. */
  hit(side) {
    if (!this.canHit(side)) return false;
    this.serving = this.phase === 'serve';
    this.phase = 'rally';
    this.lastHitter = side;
    this.needBounceOn = this.serving ? side : -side;
    return true;
  }

  /** The ball bounced on the table half of `side`. Returns a point result or null. */
  bounce(side) {
    if (this.phase !== 'rally') return null;
    if (this.needBounceOn === side) {
      if (this.serving && side === this.lastHitter) {
        this.needBounceOn = -side; // serve: own side done, now the receiver's side
      } else {
        this.needBounceOn = null;
        this.serving = false;
      }
      return null;
    }
    if (this.needBounceOn === null) return this.award(this.lastHitter, 'double bounce');
    return this.award(-this.lastHitter, this.serving ? 'serve fault' : 'net');
  }

  /** The ball crossed the end line of `side` flying away from the net. */
  endline(side) {
    if (this.phase !== 'rally') return null;
    if (this.needBounceOn === side) return this.award(side, 'long');
    return null;
  }

  /** The ball dropped below table level (floor, off the side, net drop). */
  dead() {
    if (this.phase !== 'rally') return null;
    if (this.needBounceOn !== null) return this.award(-this.lastHitter, this.serving ? 'serve fault' : 'out');
    return this.award(this.lastHitter, 'miss');
  }

  award(winner, reason) {
    this.scores[winner] += 1;
    this.phase = 'point';
    this.lastResult = { winner, reason };
    this.server = this.serverForPoint(this.totalPoints());
    return this.lastResult;
  }

  serverForPoint(index) {
    const deuceStart = 2 * (this.pointsToWin - 1);
    if (index < deuceStart) {
      return Math.floor(index / 2) % 2 === 0 ? this.firstServer : -this.firstServer;
    }
    const atDeuce = Math.floor(deuceStart / 2) % 2 === 0 ? this.firstServer : -this.firstServer;
    return (index - deuceStart) % 2 === 0 ? atDeuce : -atDeuce;
  }

  isOver() {
    const a = this.scores[1];
    const b = this.scores[-1];
    return Math.max(a, b) >= this.pointsToWin && Math.abs(a - b) >= 2;
  }

  /** Leave the point pause: start the next serve or finish the game. */
  nextPoint() {
    if (this.phase !== 'point') return;
    this.resetRally();
    if (this.isOver()) {
      this.phase = 'over';
      this.winner = this.scores[1] > this.scores[-1] ? 1 : -1;
    } else {
      this.phase = 'serve';
    }
  }
}
