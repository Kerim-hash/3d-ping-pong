import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/rules.js';

const HUMAN = 1;
const AI = -1;

function legalServe(m, server) {
  m.hit(server);
  m.bounce(server);
  m.bounce(-server);
}

// Play out one point so that `winner` takes it, whoever is serving.
function scorePoint(m, winner) {
  m.hit(m.server);
  if (winner === m.server) {
    m.bounce(m.server);
    m.bounce(-m.server);
    m.dead();
  } else {
    m.dead();
  }
  m.nextPoint();
}

test('a new match waits for the first server to serve', () => {
  const m = new Match({ firstServer: HUMAN });
  assert.equal(m.phase, 'serve');
  assert.equal(m.server, HUMAN);
  assert.equal(m.canHit(HUMAN), true);
  assert.equal(m.canHit(AI), false);
  assert.equal(m.score(HUMAN), 0);
  assert.equal(m.score(AI), 0);
});

test('after a legal serve only the receiver may hit, and only after the ball bounced on their side', () => {
  const m = new Match({ firstServer: HUMAN });
  m.hit(HUMAN);
  assert.equal(m.phase, 'rally');
  assert.equal(m.canHit(AI), false, 'ball has not bounced on the AI side yet');
  m.bounce(HUMAN);
  assert.equal(m.canHit(AI), false);
  m.bounce(AI);
  assert.equal(m.canHit(AI), true);
  assert.equal(m.canHit(HUMAN), false);
  m.hit(AI);
  assert.equal(m.canHit(HUMAN), false);
  m.bounce(HUMAN);
  assert.equal(m.canHit(HUMAN), true);
});

test('a serve that lands straight on the receiver side is a fault', () => {
  const m = new Match({ firstServer: HUMAN });
  m.hit(HUMAN);
  const r = m.bounce(AI);
  assert.equal(r.winner, AI);
  assert.equal(m.score(AI), 1);
  assert.equal(m.phase, 'point');
});

test('a ball crossing the end line without bouncing is long: point to that side', () => {
  const m = new Match({ firstServer: HUMAN });
  legalServe(m, HUMAN);
  m.hit(AI);
  const r = m.endline(HUMAN);
  assert.equal(r.winner, HUMAN);
  assert.equal(r.reason, 'long');
});

test('crossing the end line after the legal bounce is not a fault', () => {
  const m = new Match({ firstServer: HUMAN });
  legalServe(m, HUMAN);
  m.hit(AI);
  m.bounce(HUMAN);
  assert.equal(m.endline(HUMAN), null);
  assert.equal(m.phase, 'rally');
});

test('a net dribble that falls back on the hitter side loses the point', () => {
  const m = new Match({ firstServer: HUMAN });
  legalServe(m, HUMAN);
  m.hit(AI);
  const r = m.bounce(AI);
  assert.equal(r.winner, HUMAN);
});

test('a ball that drops dead before bouncing on the far side is the hitter fault', () => {
  const m = new Match({ firstServer: HUMAN });
  m.hit(HUMAN);
  const r = m.dead();
  assert.equal(r.winner, AI);
});

test('a ball that drops dead after the legal bounce means the receiver missed', () => {
  const m = new Match({ firstServer: HUMAN });
  legalServe(m, HUMAN);
  const r = m.dead();
  assert.equal(r.winner, HUMAN);
  assert.equal(r.reason, 'miss');
});

test('two bounces on the receiver side give the point to the hitter', () => {
  const m = new Match({ firstServer: HUMAN });
  legalServe(m, HUMAN);
  const r = m.bounce(AI);
  assert.equal(r.winner, HUMAN);
  assert.equal(r.reason, 'double bounce');
});

test('events during the point pause are ignored until nextPoint', () => {
  const m = new Match({ firstServer: HUMAN });
  m.hit(HUMAN);
  m.dead();
  assert.equal(m.bounce(HUMAN), null);
  assert.equal(m.dead(), null);
  assert.equal(m.canHit(HUMAN), false);
  m.nextPoint();
  assert.equal(m.phase, 'serve');
  assert.equal(m.canHit(m.server), true);
});

test('service changes every two points, and every point from 10-10', () => {
  const m = new Match({ firstServer: HUMAN });
  scorePoint(m, HUMAN);
  assert.equal(m.server, HUMAN);
  scorePoint(m, HUMAN);
  assert.equal(m.server, AI);
  scorePoint(m, HUMAN);
  scorePoint(m, HUMAN);
  assert.equal(m.server, HUMAN);
  for (let i = 0; i < 6; i++) scorePoint(m, HUMAN); // 10-0
  for (let i = 0; i < 10; i++) scorePoint(m, AI); // 10-10
  assert.equal(m.score(HUMAN), 10);
  assert.equal(m.score(AI), 10);
  assert.equal(m.phase, 'serve');
  const s0 = m.server;
  scorePoint(m, HUMAN); // 11-10, not over, server switches every point now
  assert.equal(m.phase, 'serve');
  assert.equal(m.server, -s0);
  scorePoint(m, HUMAN); // 12-10, over
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, HUMAN);
});

test('the game ends at 11 with a two point lead', () => {
  const m = new Match({ firstServer: AI, pointsToWin: 11 });
  for (let i = 0; i < 10; i++) scorePoint(m, HUMAN);
  assert.equal(m.phase, 'serve', 'not over at 10-0');
  scorePoint(m, HUMAN);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, HUMAN);
  assert.equal(m.score(HUMAN), 11);
  assert.equal(m.score(AI), 0);
});
