// Rules self-check: node src/game.test.js
import assert from 'node:assert';
import {
  CARD_TYPES, COLORS, buildDeck, scoreCards, startGame, act, publicState, legalActions, botAction, playerScore,
} from './game.js';

let nextId = 1000;
const C = (type, color = 'navy') => ({ id: nextId++, type, color });
const total = (cards) => scoreCards(cards).total;
const rep = (type, n, color) => Array.from({ length: n }, () => C(type, color));

// ---------- deck (58 cards) ----------
const deck = buildDeck();
assert.equal(deck.length, 58, 'deck is 58 cards');
assert.equal(new Set(deck.map((c) => c.id)).size, 58, 'unique ids');
for (const [t, def] of Object.entries(CARD_TYPES)) assert.equal(deck.filter((c) => c.type === t).length, def.count, t);
assert.equal(deck.filter((c) => c.type === 'deer').length, 4, '4 deer');
assert.ok(deck.filter((c) => c.type === 'deer').every((c) => c.color === 'mono'), 'deer are mono/white');
const mult = deck.filter((c) => CARD_TYPES[c.type].kind === 'mult');
assert.equal(new Set(mult.map((c) => c.color)).size, mult.length, 'multiplier colors are unique');
assert.ok(mult.every((c) => !COLORS.includes(c.color)), 'multiplier colors are not common colors');

// ---------- duo scoring: 1 pt per pair, held OR played ----------
assert.equal(total([C('fox'), C('fox')]), 1, 'a held pair still scores');
assert.equal(total([C('fox'), C('fox'), C('fox')]), 1, 'odd duo card wastes');
assert.equal(total(rep('capybara', 4)), 2, 'two capybara pairs');
// mixed Swimmer+Shark pair = min(raccoon, badger)
assert.equal(total([C('raccoon'), C('badger')]), 1, 'raccoon+badger is one pair');
assert.equal(total([...rep('raccoon', 3), ...rep('badger', 1)]), 1, 'mixed pairs = min count');
assert.equal(total([...rep('raccoon', 3), ...rep('badger', 2)]), 2, 'mixed pairs = min count (2)');
assert.equal(total([C('raccoon'), C('raccoon')]), 0, 'two raccoons do not pair');

// ---------- collector tables ----------
assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => total(rep('wombat', n))), [0, 2, 4, 6, 8, 10, 10], 'shell/wombat');
assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => total(rep('hedgehog', n))), [0, 3, 6, 9, 12, 12], 'octopus/hedgehog');
assert.deepEqual([1, 2, 3, 4].map((n) => total(rep('penguin', n))), [1, 3, 5, 5], 'penguin');
assert.deepEqual([1, 2, 3].map((n) => total(rep('mole', n))), [0, 5, 5], 'sailor/mole');

// ---------- multipliers (0 alone, never count as their own base) ----------
assert.equal(total([C('owl', 'gold')]), 0, 'multiplier alone is 0');
assert.equal(total([C('owl', 'gold'), ...rep('rabbit', 2)]), 1 + 2, 'owl +1 per rabbit, on held pairs too'); // 1 pair + owl×2
assert.equal(total([C('koala', 'silver'), ...rep('capybara', 3)]), 1 + 3, 'koala 1 per capybara');
assert.equal(total([C('bear', 'rust'), ...rep('penguin', 2)]), 3 + 4, 'bear 2 per penguin');
assert.equal(total([C('lion', 'crimson'), ...rep('mole', 2)]), 5 + 6, 'lion 3 per mole');

// ---------- mermaids (deer) ----------
// 2 deer, distinct color groups ranked descending — each color used by at most one deer.
let m = scoreCards([C('deer'), C('deer'), ...rep('wombat', 4, 'blue'), ...rep('wombat', 3, 'green'), C('fox', 'red')]);
// groups: blue 4, green 3, red 1, mono(deer) 2 → top two = 4 + 3 = 7
assert.equal(m.items.find((it) => it.label.includes('Deer')).pts, 7, 'two deer score the two largest color groups');
let m1 = scoreCards([C('deer'), ...rep('wombat', 5, 'blue')]);
assert.equal(m1.items.find((it) => it.label.includes('Deer')).pts, 5, 'one deer scores the largest group');
let m3 = scoreCards([C('deer'), C('deer')]); // only color is mono (the 2 deer): group size 2, then nothing
assert.equal(m3.items.find((it) => it.label.includes('Deer')).pts, 2, 'extra deer beyond colors score 0');

// ---------- color bonus (mermaids count as mono) ----------
let b = scoreCards([C('lion', 'crimson'), C('penguin', 'teal'), C('fox', 'teal'), C('rabbit', 'teal'), C('fox', 'coral')]);
assert.equal(b.colorBonus, 3, 'color bonus = biggest color group');
assert.equal(scoreCards([]).colorBonus, 0);
assert.equal(scoreCards([C('deer'), C('deer'), C('deer')]).colorBonus, 3, 'deer count toward mono color bonus');

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
no(s, 0, { type: 'stop' });              // score 0 < 7
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
// Rabbit (Boat): extra turn.
s = rig();
const r1 = C('rabbit'), r2 = C('rabbit');
s.players[0].hand = [r1, r2, C('fox')];
ok(s, 0, { type: 'take', pile: 0 });
no(s, 0, { type: 'pair', cards: [r1.id, s.players[0].hand[2].id] }); // mixed types that don't pair
ok(s, 0, { type: 'pair', cards: [r1.id, r2.id] });
assert.equal(s.players[0].played.length, 1);
assert.equal(s.currentIdx, 0, 'rabbit: same player again');
assert.equal(s.step, 'draw', 'rabbit: jumps straight to the extra turn, no End turn needed');
ok(s, 0, { type: 'take', pile: 1 });
ok(s, 0, { type: 'end' });
assert.equal(s.currentIdx, 1, 'but only once');

// Capybara (Fish): draw the top of the deck straight to hand.
s = rig();
const c1 = C('capybara'), c2 = C('capybara');
s.players[0].hand = [c1, c2];
s.deck = [C('mint'), C('wombat')];
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'pair', cards: [c1.id, c2.id] });
assert.equal(s.step, 'play', 'fish has no choose step');
assert.ok(s.players[0].hand.some((c) => c.type === 'wombat'), 'drew the top card to hand');
assert.equal(s.deck.length, 1, 'only one card drawn');

// Swimmer+Shark (Raccoon+Badger): steal a random card from a chosen opponent, one-way.
s = rig();
const k1 = C('raccoon'), k2 = C('badger'), mine = C('penguin'), theirs = C('lion', 'crimson');
s.players[0].hand = [k1, k2, mine];
s.players[1].hand = [theirs];
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'pair', cards: [k1.id, k2.id] });
assert.equal(s.step, 'steal');
no(s, 0, { type: 'steal', target: 0 });       // can't steal from yourself
ok(s, 0, { type: 'steal', target: 1 });
assert.ok(s.players[0].hand.includes(theirs), 'stole their card');
assert.equal(s.players[1].hand.length, 0, 'victim lost a card and got nothing back');
assert.ok(s.players[0].hand.includes(mine), 'thief keeps their own cards');
// …and skipped when nobody else holds cards.
s = rig();
s.players[0].hand = [C('raccoon'), C('badger')];
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'pair', cards: s.players[0].hand.filter((c) => c.type === 'raccoon' || c.type === 'badger').map((c) => c.id) });
assert.equal(s.step, 'play');

// Fox (Crab): look through a pile and take ANY card, not just the top.
s = rig();
const f1 = C('fox'), f2 = C('fox');
const buried = C('mole'), topCard = C('penguin');
s.discards = [[buried, topCard], [C('rabbit')]];
s.players[0].hand = [f1, f2];
ok(s, 0, { type: 'take', pile: 1 });        // take rabbit, leaves pile 0 with 2 cards
s.players[0].hand = [f1, f2];
ok(s, 0, { type: 'pair', cards: [f1.id, f2.id] });
assert.equal(s.step, 'fox');
no(s, 0, { type: 'fox', cardId: buried.id }); // must choose a pile first
ok(s, 0, { type: 'foxPile', pile: 0 });       // commit to pile 0
assert.equal(s.foxPile, 0);
no(s, 0, { type: 'fox', cardId: 99999 });      // not in the pile
ok(s, 0, { type: 'fox', cardId: buried.id });  // the buried card, not the top
assert.ok(s.players[0].hand.includes(buried), 'took the buried card');
assert.equal(s.discards[0].at(-1), topCard, 'top card stays');
// legalActions: pick a pile first, then one action per card in that pile only.
s = rig();
s.discards = [[C('mole'), C('penguin')], [C('wombat')]];
s.players[0].hand = [C('fox'), C('fox')];
s.step = 'fox'; s.foxPile = null;
assert.equal(legalActions(s).filter((a) => a.type === 'foxPile').length, 2, 'fox: first, one choice per non-empty pile');
s.foxPile = 0;
assert.equal(legalActions(s).filter((a) => a.type === 'fox').length, 2, 'fox: then one action per card in the chosen pile');

// ---------- mermaid instant win on every acquisition path ----------
// via take-from-discard
s = rig();
s.players[0].hand = [C('deer'), C('deer'), C('deer')];
s.discards = [[C('deer')], [C('rabbit')]];
ok(s, 0, { type: 'take', pile: 0 });
assert.equal(s.phase, 'gameOver');
assert.deepEqual(s.winnerIds, [0]);
assert.equal(s.result.reason, 'mermaids');
// via fish (capybara pair draws the 4th deer)
s = rig();
s.players[0].hand = [C('deer'), C('deer'), C('deer'), C('capybara'), C('capybara')];
s.deck = [C('deer')];
ok(s, 0, { type: 'take', pile: 0 });
const caps = s.players[0].hand.filter((c) => c.type === 'capybara');
ok(s, 0, { type: 'pair', cards: [caps[0].id, caps[1].id] });
assert.equal(s.phase, 'gameOver', 'fish-drawn 4th deer wins');
assert.deepEqual(s.winnerIds, [0]);

// ---------- ending a round ----------
// STOP: everyone scores cards, no color bonus.
s = rig();
s.players[0].hand = [C('penguin', 'teal'), C('penguin', 'teal'), C('wombat', 'teal'), C('wombat', 'teal')]; // penguin 3 + wombat 2 = 5
s.players[1].hand = [C('penguin', 'navy'), C('penguin', 'navy')];                                     // 3
ok(s, 0, { type: 'take', pile: 0 });
s.players[0].hand = [C('penguin', 'teal'), C('penguin', 'teal'), C('penguin', 'teal'), C('mole', 'teal'), C('mole', 'teal')]; // 5 + 5 = 10
assert.equal(playerScore(s.players[0]).total, 10);
ok(s, 0, { type: 'stop' });
assert.equal(s.phase, 'roundEnd');
assert.deepEqual(s.players.map((p) => p.score), [10, 3]);

// CALL, caller holds: caller cards + color bonus, others only color bonus.
s = rig(['A', 'B', 'C']);
s.deck = Array.from({ length: 10 }, () => C('owl', 'gold')); // lone owls score nothing
s.players[0].hand = [C('penguin', 'teal'), C('penguin', 'teal'), C('penguin', 'teal'), C('mole', 'teal'), C('mole', 'teal')]; // 10, bonus 5 (+fox navy)
s.players[1].hand = [C('penguin', 'navy'), C('penguin', 'navy'), C('fox', 'navy')];                      // 3, bonus 3
s.players[2].hand = [C('penguin', 'coral')];                                                             // 1, bonus 1
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'call' });
assert.equal(s.currentIdx, 1, 'everyone else gets a last turn');
no(s, 1, { type: 'stop' });
for (const pid of [1, 2]) { ok(s, pid, { type: 'draw' }); ok(s, pid, { type: 'keep', index: 0, pile: 0 }); ok(s, pid, { type: 'end' }); }
assert.equal(s.phase, 'roundEnd');
assert.equal(s.result.success, true);
// caller: 10 cards + color bonus 5 (5 teal). others: color bonus only (navy 3; coral/gold 1).
assert.deepEqual(s.result.rows.map((r) => r.gained), [10 + 5, 3, 1]);

// CALL, caller beaten: caller only color bonus, others score cards.
s = rig();
s.players[0].hand = [C('penguin', 'teal'), C('penguin', 'teal'), C('penguin', 'teal'), C('wombat', 'teal'), C('wombat', 'teal')]; // penguin 5 + wombat 2 = 7 (+fox navy)
s.players[1].hand = [C('mole', 'navy'), C('mole', 'navy'), C('penguin', 'navy'), C('penguin', 'navy')];       // mole 5 + penguin 3 = 8
ok(s, 0, { type: 'take', pile: 0 });
ok(s, 0, { type: 'call' });
ok(s, 1, { type: 'take', pile: 1 }); ok(s, 1, { type: 'end' });
assert.equal(s.result.success, false);
assert.equal(s.result.rows[1].gained, 8, 'the winner scores their cards');

// Game over at the target.
s = rig();
s.players[0].score = 35;
s.players[0].hand = [C('penguin'), C('penguin'), C('penguin'), C('mole'), C('mole')];
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
// Crab reveals only the committed pile, to the chooser only.
s = startGame(['A', 'B']);
s.step = 'fox'; s.foxPile = null; s.discards = [[C('mole'), C('penguin')], [C('wombat')]];
assert.equal(publicState(s, 0).foxCards, null, 'no pile revealed before one is chosen');
s.foxPile = 0;
assert.equal(publicState(s, 0).foxCards.length, 2, 'chooser sees the chosen pile only');
assert.ok(!publicState(s, 0).foxCards.some((c) => c.type === 'wombat'), 'the other pile stays hidden');
assert.equal(publicState(s, 1).foxCards, null, 'opponents see no pile contents');

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
      if (s.phase === 'playing') assert.equal(countCards(s), 58, 'cards are conserved');
    }
    assert.ok(s.winnerIds.length >= 1);
    // A game ends either at the target score or by a mermaid instant win.
    assert.ok(s.result.reason === 'mermaids' || s.players.some((p) => p.score >= s.target));
  }
}

// Network intents are untrusted: prototype-ish keys must be rejected, not crash the host.
for (const junk of ['constructor', '__proto__', '0', 2]) {
  const s = startGame(['A', 'B']);
  assert.equal(act(s, 0, { type: 'take', pile: junk }), false);
  s.step = 'fox'; assert.equal(act(s, 0, { type: 'fox', pile: junk }), false);
  s.step = 'steal'; s.players[0].hand = [C('fox')]; s.players[1].hand = [C('fox')];
  assert.equal(act(s, 0, { type: 'steal', target: junk }), false);
}

// ---------- game-end tie-break: most points this round wins ----------
s = startGame(['A', 'B']);
s.players[0].score = 30; s.players[1].score = 28;        // both reach 40 this round
s.players[0].hand = rep('wombat', 6);                     // scores 10 -> 40
s.players[1].hand = rep('hedgehog', 5);                   // scores 12 -> 40
s.currentIdx = 0; s.step = 'play'; s.call = null;
ok(s, 0, { type: 'stop' });
assert.equal(s.phase, 'gameOver');
assert.deepEqual(s.winnerIds, [1], 'tie on total broken by most points in the last round');

console.log('game.test.js: all assertions passed');
