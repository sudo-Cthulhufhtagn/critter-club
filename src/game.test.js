// Rules self-check: node src/game.test.js
import assert from 'node:assert';
import {
  CARD_TYPES, COLORS, buildDeck, scoreCards, startGame, act, publicState, legalActions, botAction, playerScore,
} from './game.js';

let nextId = 1000;
const C = (type, color = 'navy') => ({ id: nextId++, type, color });
const total = (cards, pairs = 0) => scoreCards(cards, pairs).total;

// ---------- deck ----------
const deck = buildDeck();
assert.equal(deck.length, 56);
assert.equal(new Set(deck.map((c) => c.id)).size, 56, 'unique ids');
for (const [t, def] of Object.entries(CARD_TYPES)) assert.equal(deck.filter((c) => c.type === t).length, def.count, t);
assert.equal(new Set(deck.filter((c) => c.type === 'hedgehog').map((c) => c.color)).size, 7, 'one hedgehog per color');
const rare = deck.filter((c) => CARD_TYPES[c.type].color);
assert.equal(new Set(rare.map((c) => c.color)).size, rare.length, 'rare colors are unique');
assert.ok(rare.every((c) => !COLORS.includes(c.color)), 'rare colors are not common colors');

// ---------- scoring ----------
assert.equal(total([C('capybara'), C('capybara')], 1), 1, 'a played pair is 1 point');
assert.equal(total([C('fox'), C('fox')], 0), 0, 'an unplayed pair in hand scores nothing');
assert.deepEqual([1, 2, 3, 4, 5].map((n) => total(Array.from({ length: n }, () => C('wombat')))), [1, 3, 6, 10, 10], 'wombat curve caps at 4');
assert.equal(total([C('hedgehog', 'navy'), C('hedgehog', 'navy'), C('hedgehog', 'teal')]), 2, 'hedgehog: distinct colors');
assert.deepEqual([1, 2, 3, 4].map((n) => total(Array.from({ length: n }, () => C('penguin')))), [0, 4, 4, 8], 'penguin: 4 per 2');
assert.equal(total([C('owl', 'gold')]), 0, 'multiplier alone is 0');
assert.equal(total([C('owl', 'gold'), C('fox'), C('fox'), C('fox')], 1), 1 + 3, 'owl +1 per fox, played or not');
assert.equal(total([C('koala', 'silver'), C('wombat'), C('wombat')]), 3 + 4, 'koala +2 per wombat');
assert.equal(total([C('bear', 'rust'), C('capybara'), C('raccoon'), C('raccoon')]), 3, 'bear +1 per capybara/raccoon');
let b = scoreCards([C('lion', 'crimson'), C('penguin', 'teal'), C('fox', 'teal'), C('rabbit', 'teal'), C('fox', 'coral')], 0);
assert.equal(b.colorBonus, 3, 'color bonus = biggest color group');
assert.equal(b.total, 3, 'lion = biggest color group');
assert.equal(scoreCards([], 0).colorBonus, 0);

// ---------- helpers for scripted rounds ----------
function rig(names = ['A', 'B']) {
  const s = startGame(names);
  s.deck = []; s.discards = [[C('fox')], [C('rabbit')]];
  return s;
}
const ok = (s, pid, a) => assert.ok(act(s, pid, a), JSON.stringify(a));
const no = (s, pid, a) => assert.equal(act(s, pid, a), false, JSON.stringify(a));

// ---------- turn flow ----------
let s = rig();
s.deck = [C('penguin'), C('wombat')]; // top of deck = end of array
no(s, 1, { type: 'draw' });              // not your turn
ok(s, 0, { type: 'draw' });
assert.equal(s.step, 'choose');
assert.equal(s.pending[0].type, 'wombat', 'pending[0] is the top card');
no(s, 0, { type: 'keep', index: 2, pile: 0 });
ok(s, 0, { type: 'keep', index: 0, pile: 1 });
assert.deepEqual(s.players[0].hand.map((c) => c.type), ['wombat']);
assert.equal(s.discards[1].at(-1).type, 'penguin', 'the other card goes face up on the chosen pile');
no(s, 0, { type: 'stop' });              // score 1 < 7
ok(s, 0, { type: 'end' });
assert.equal(s.currentIdx, 1);

// An empty discard pile must take the discard.
s = rig();
s.discards = [[], [C('fox')]];
s.deck = [C('penguin'), C('wombat')];
ok(s, 0, { type: 'draw' });
no(s, 0, { type: 'keep', index: 0, pile: 1 });
ok(s, 0, { type: 'keep', index: 0, pile: 0 });

// Take from discard.
s = rig();
no(s, 0, { type: 'take', pile: 2 });
ok(s, 0, { type: 'take', pile: 0 });
assert.equal(s.players[0].hand[0].type, 'fox');
assert.equal(s.discards[0].length, 0);

// Empty deck when you must draw → round void, nobody scores.
s = rig();
s.players[0].hand = [C('wombat'), C('wombat'), C('wombat')];
ok(s, 0, { type: 'draw' });
assert.equal(s.phase, 'roundEnd');
assert.equal(s.result.reason, 'void');
assert.ok(s.players.every((p) => p.score === 0));

// ---------- pair effects ----------
// Rabbit: extra turn.
s = rig();
const r1 = C('rabbit'), r2 = C('rabbit');
s.players[0].hand = [r1, r2, C('fox')];
ok(s, 0, { type: 'take', pile: 0 });
no(s, 0, { type: 'pair', cards: [r1.id, s.players[0].hand[2].id] }); // mixed types
ok(s, 0, { type: 'pair', cards: [r1.id, r2.id] });
assert.equal(s.players[0].played.length, 1);
ok(s, 0, { type: 'end' });
assert.equal(s.currentIdx, 0, 'rabbit: same player again');
assert.equal(s.step, 'draw');
ok(s, 0, { type: 'take', pile: 1 });
ok(s, 0, { type: 'end' });
assert.equal(s.currentIdx, 1, 'but only once');

// Capybara: peek 3, keep 1, rest to discards.
s = rig();
const c1 = C('capybara'), c2 = C('capybara');
s.players[0].hand = [c1, c2];
s.deck = [C('mint'), C('penguin'), C('hedgehog'), C('wombat')];
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'pair', cards: [c1.id, c2.id] });
assert.equal(s.step, 'capybara');
assert.deepEqual(s.pending.map((c) => c.type), ['wombat', 'hedgehog', 'penguin']);
no(s, 0, { type: 'end' });
ok(s, 0, { type: 'capyKeep', index: 1 });
assert.ok(s.players[0].hand.some((c) => c.type === 'hedgehog'));
assert.equal(s.deck.length, 1);
assert.equal(s.discards[0].length + s.discards[1].length, 1 + 2, 'the other two are discarded');
assert.equal(s.step, 'play');

// Raccoon: swap one of mine with a random one of theirs.
s = rig();
const k1 = C('raccoon'), k2 = C('raccoon'), mine = C('penguin'), theirs = C('lion', 'crimson');
s.players[0].hand = [k1, k2, mine];
s.players[1].hand = [theirs];
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'pair', cards: [k1.id, k2.id] });
assert.equal(s.step, 'raccoon');
no(s, 0, { type: 'raccoon', target: 0, cardId: mine.id });
ok(s, 0, { type: 'raccoon', target: 1, cardId: mine.id });
assert.ok(s.players[0].hand.includes(theirs));
assert.deepEqual(s.players[1].hand, [mine]);
// …and skipped when nobody else holds cards.
s = rig();
s.players[0].hand = [C('raccoon'), C('raccoon')];
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'pair', cards: s.players[0].hand.filter((c) => c.type === 'raccoon').map((c) => c.id) });
assert.equal(s.step, 'play');

// Fox: take the top of a discard pile.
s = rig();
const f1 = C('fox'), f2 = C('fox');
s.players[0].hand = [f1, f2];
ok(s, 0, { type: 'take', pile: 0 });
s.players[0].hand = s.players[0].hand.filter((c) => c === f1 || c === f2);
ok(s, 0, { type: 'pair', cards: [f1.id, f2.id] });
assert.equal(s.step, 'fox');
no(s, 0, { type: 'fox', pile: 0 });       // empty now
ok(s, 0, { type: 'fox', pile: 1 });
assert.equal(s.players[0].hand[0].type, 'rabbit');

// ---------- ending a round ----------
// STOP: everyone scores cards, no color bonus.
s = rig();
s.players[0].hand = [C('penguin', 'teal'), C('penguin', 'teal'), C('wombat', 'teal'), C('wombat', 'teal')]; // 4 + 3 = 7
s.players[1].hand = [C('penguin', 'navy'), C('penguin', 'navy')];                                     // 4
ok(s, 0, { type: 'take', pile: 0 });
assert.equal(playerScore(s.players[0]).total, 7);
ok(s, 0, { type: 'stop' });
assert.equal(s.phase, 'roundEnd');
assert.deepEqual(s.players.map((p) => p.score), [7, 4]);

// CALL, caller holds: caller cards + color bonus, others only color bonus.
s = rig(['A', 'B', 'C']);
s.deck = Array.from({ length: 10 }, () => C('rabbit', 'mint')); // lone rabbits score nothing
s.players[0].hand = [C('penguin', 'teal'), C('penguin', 'teal'), C('wombat', 'teal'), C('wombat', 'teal')]; // 7, bonus 4 (+fox navy)
s.players[1].hand = [C('penguin', 'navy'), C('penguin', 'navy'), C('fox', 'navy')];                      // 4, bonus 3
s.players[2].hand = [C('wombat', 'coral')];                                                               // 1, bonus 1
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'call' });
assert.equal(s.currentIdx, 1, 'everyone else gets a last turn');
no(s, 1, { type: 'stop' });
for (const pid of [1, 2]) { ok(s, pid, { type: 'draw' }); ok(s, pid, { type: 'keep', index: 0, pile: 0 }); ok(s, pid, { type: 'end' }); }
assert.equal(s.phase, 'roundEnd');
assert.equal(s.result.success, true);
assert.deepEqual(s.result.rows.map((r) => r.gained), [7 + 4, 3, 1]);

// CALL, caller beaten: caller only color bonus, others score cards.
s = rig();
s.players[0].hand = [C('penguin', 'teal'), C('penguin', 'teal'), C('wombat', 'teal'), C('wombat', 'teal')]; // 7 (+fox navy)
s.players[1].hand = [C('penguin', 'navy'), C('penguin', 'navy'), C('penguin', 'navy'), C('penguin', 'navy')]; // 8
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'call' });
ok(s, 1, { type: 'take', pile: 1 }); ok(s, 1, { type: 'end' });
assert.equal(s.result.success, false);
assert.deepEqual(s.result.rows.map((r) => r.gained), [4, 8]);

// Game over at the target.
s = rig();
s.players[0].score = 35;
s.players[0].hand = [C('penguin'), C('penguin'), C('wombat'), C('wombat')];
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'stop' });
assert.equal(s.phase, 'gameOver');
assert.deepEqual(s.winnerIds, [0]);
assert.equal(startGame(['a', 'b', 'c']).target, 35);
assert.equal(startGame(['a', 'b', 'c', 'd']).target, 30);

// ---------- hidden information ----------
s = startGame(['A', 'B']);
ok(s, 0, { type: 'draw' });
let v1 = publicState(s, 1), v0 = publicState(s, 0);
assert.equal(v1.deck, undefined, 'deck order never leaves the host');
assert.equal(v1.deckCount, s.deck.length);
assert.equal(v1.pending.length, 0, 'others cannot see your draw');
assert.equal(v0.pending.length, 2, 'but you can');
assert.equal(v1.players[0].hand, null);
assert.equal(v1.myScore.total, 0);
assert.ok(v1.discards.every((d) => !Array.isArray(d)), 'only pile tops are sent');
assert.ok(!JSON.stringify(v1).includes('"deck"'));

// ---------- fuzz: full games with random / bot players ----------
const countCards = (s) => s.deck.length + s.discards[0].length + s.discards[1].length + s.pending.length
  + s.players.reduce((n, p) => n + p.hand.length + p.played.flat().length, 0);
for (const n of [2, 3, 4]) {
  for (let g = 0; g < 30; g++) {
    const s = startGame(Array.from({ length: n }, (_, i) => `P${i}`));
    const useBot = g % 2 === 0;
    let steps = 0;
    while (s.phase !== 'gameOver') {
      assert.ok(++steps < 50000, `game ${n}p #${g} did not finish`);
      const acts = legalActions(s);
      assert.ok(acts.length, `no legal action in ${s.phase}/${s.step}`);
      let a = useBot && s.phase === 'playing' ? botAction(s) : acts[Math.floor(Math.random() * acts.length)];
      // Random players dawdle forever; nudge them to finish rounds sometimes.
      if (!useBot && acts.some((x) => x.type === 'stop') && Math.random() < 0.5) a = { type: Math.random() < 0.5 ? 'stop' : 'call' };
      const pid = s.phase === 'playing' ? s.players[s.currentIdx].id : 0;
      assert.ok(act(s, pid, a), `illegal ${JSON.stringify(a)} in ${s.step}`);
      if (s.phase === 'playing') assert.equal(countCards(s), 56, 'cards are conserved');
    }
    assert.ok(s.winnerIds.length >= 1);
    assert.ok(s.players.some((p) => p.score >= s.target));
  }
}

// Network intents are untrusted: prototype-ish keys must be rejected, not crash the host.
for (const junk of ['constructor', '__proto__', '0', 2]) {
  const s = startGame(['A', 'B']);
  assert.equal(act(s, 0, { type: 'take', pile: junk }), false);
  s.step = 'fox'; assert.equal(act(s, 0, { type: 'fox', pile: junk }), false);
  s.step = 'raccoon'; s.players[0].hand = [C('fox')]; s.players[1].hand = [C('fox')];
  assert.equal(act(s, 0, { type: 'raccoon', target: junk, cardId: s.players[0].hand[0].id }), false);
}

console.log('game.test.js: all assertions passed');
