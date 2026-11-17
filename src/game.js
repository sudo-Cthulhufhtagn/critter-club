// Critter Club rules engine — pure, no DOM. Host-authoritative; `act` mutates `state`
// and returns true if the action was legal.

export const COLORS = ['navy', 'teal', 'coral', 'sand', 'lilac', 'mint', 'mono'];
export const COLOR_NAMES = {
  navy: 'Navy', teal: 'Teal', coral: 'Coral', sand: 'Sand', lilac: 'Lilac', mint: 'Mint', mono: 'Black & White',
  gold: 'Gold', silver: 'Silver', rust: 'Rust', crimson: 'Crimson',
};

// THE card table: every count lives here (58 cards, faithful to Sea Salt & Paper). Common cards
// cycle through COLORS; mermaids + multipliers carry their own fixed `color`.
export const CARD_TYPES = {
  fox:      { kind: 'duo', count: 9, name: 'Fox',      icon: 'fox', text: 'Pair: take any card from one pile' },
  rabbit:   { kind: 'duo', count: 8, name: 'Rabbit',   icon: 'rabbit', text: 'Pair: take another turn' },
  capybara: { kind: 'duo', count: 7, name: 'Capybara', icon: 'capybara', text: 'Pair: draw the top of the deck' },
  raccoon:  { kind: 'duo', count: 5, name: 'Raccoon',  icon: 'raccoon-head', text: 'With a Badger: steal a card' },
  badger:   { kind: 'duo', count: 5, name: 'Badger',   icon: 'badger', text: 'With a Raccoon: steal a card' },
  wombat:   { kind: 'collect', count: 6, name: 'Wombat',   icon: 'wombat', text: '0·2·4·6·8·10 for 1–6' },
  hedgehog: { kind: 'collect', count: 5, name: 'Hedgehog', icon: 'hedgehog', text: '0·3·6·9·12 for 1–5' },
  penguin:  { kind: 'collect', count: 3, name: 'Penguin',  icon: 'penguin', text: '1·3·5 for 1–3' },
  mole:     { kind: 'collect', count: 2, name: 'Mole',     icon: 'mole', text: '0·5 for 1–2' },
  deer:     { kind: 'mermaid', count: 4, color: 'mono', name: 'Deer', icon: 'stag-head', text: 'Scores a color group; all 4 win' },
  owl:      { kind: 'mult', count: 1, color: 'gold',    name: 'Owl',   icon: 'barn-owl', text: '1 per Rabbit' },
  koala:    { kind: 'mult', count: 1, color: 'silver',  name: 'Koala', icon: 'koala', text: '1 per Capybara' },
  bear:     { kind: 'mult', count: 1, color: 'rust',    name: 'Bear',  icon: 'bear-head', text: '2 per Penguin' },
  lion:     { kind: 'mult', count: 1, color: 'crimson', name: 'Lion',  icon: 'lion', text: '3 per Mole' },
};
export const PAIR_TYPES = Object.keys(CARD_TYPES).filter((t) => CARD_TYPES[t].kind === 'duo');
export const TARGETS = { 2: 40, 3: 35, 4: 30 };
export const MIN_TO_END = 7;
// Collector curves, indexed by how many you hold (0 = none).
const COLLECT = { wombat: [0, 0, 2, 4, 6, 8, 10], hedgehog: [0, 0, 3, 6, 9, 12], penguin: [0, 1, 3, 5], mole: [0, 0, 5] };

// The duo effect a pair of these two types triggers, or null if they don't pair.
export function pairEffect(t1, t2) {
  if (t1 === t2 && (t1 === 'fox' || t1 === 'rabbit' || t1 === 'capybara')) return t1;
  if ((t1 === 'raccoon' && t2 === 'badger') || (t1 === 'badger' && t2 === 'raccoon')) return 'steal';
  return null;
}

export function buildDeck() {
  const deck = [];
  Object.entries(CARD_TYPES).forEach(([type, def], k) => {
    for (let i = 0; i < def.count; i++)
      deck.push({ id: deck.length, type, color: def.color || COLORS[(i + k) % COLORS.length] });
  });
  return deck;
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- scoring ----------
// `cards` = hand + played cards. Duos score whether held or played.
export function scoreCards(cards) {
  const n = (t) => cards.filter((c) => c.type === t).length;
  const byColor = {};
  for (const c of cards) byColor[c.color] = (byColor[c.color] || 0) + 1;
  const colorBonus = Math.max(0, ...Object.values(byColor));
  const items = [];
  const add = (label, pts) => items.push({ label, pts });
  // Duos: 1 pt per pair, held OR played. Mixed Raccoon+Badger pairs = min of the two counts.
  const pairs = Math.floor(n('fox') / 2) + Math.floor(n('rabbit') / 2) + Math.floor(n('capybara') / 2)
    + Math.min(n('raccoon'), n('badger'));
  if (pairs) add(`${pairs} pair${pairs > 1 ? 's' : ''}`, pairs);
  for (const [t, tbl] of Object.entries(COLLECT)) {
    const c = n(t);
    if (c) add(`${c} ${CARD_TYPES[t].name}`, tbl[Math.min(c, tbl.length - 1)]);
  }
  // Mermaids: each deer scores the next-largest distinct color group (deer themselves count as mono).
  const deer = n('deer');
  if (deer) {
    const sizes = Object.values(byColor).sort((a, b) => b - a);
    let pts = 0;
    for (let i = 0; i < deer; i++) pts += sizes[i] || 0;
    add(`${deer} Deer`, pts);
  }
  // Multipliers (0 on their own; never count as their own base since each has its own type).
  if (n('owl')) add(`Owl × ${n('rabbit')} Rabbit`, n('owl') * n('rabbit'));
  if (n('koala')) add(`Koala × ${n('capybara')} Capybara`, n('koala') * n('capybara'));
  if (n('bear')) add(`Bear × ${n('penguin')} Penguin`, n('bear') * 2 * n('penguin'));
  if (n('lion')) add(`Lion × ${n('mole')} Mole`, n('lion') * 3 * n('mole'));
  return { items, total: items.reduce((a, b) => a + b.pts, 0), colorBonus };
}
export const allCards = (p) => [...p.hand, ...p.played.flat()];
export const playerScore = (p) => scoreCards(allCards(p));

// ---------- game flow ----------
export function startGame(names) {
  if (names.length < 2 || names.length > 4) throw new Error('2–4 players');
  const s = {
    phase: 'playing', target: TARGETS[names.length], round: 0, starterIdx: 0, log: [], result: null, winnerIds: null,
    players: names.map((name, id) => ({ id, name: String(name).trim() || `Player ${id + 1}`, score: 0, hand: [], played: [] })),
  };
  startRound(s);
  return s;
}

export function startRound(s) {
  s.round++;
  s.deck = shuffle(buildDeck());
  s.discards = [[s.deck.pop()], [s.deck.pop()]];
  for (const p of s.players) { p.hand = []; p.played = []; }
  s.currentIdx = s.starterIdx % s.players.length;
  Object.assign(s, { phase: 'playing', step: 'draw', pending: [], extraTurn: false, call: null, result: null, foxPile: null });
  log(s, `Round ${s.round} — ${cur(s).name} starts.`);
}

const cur = (s) => s.players[s.currentIdx];
const name = (s, id) => s.players[id].name;
function log(s, msg) { s.log.push(msg); if (s.log.length > 100) s.log.shift(); }
const takeById = (arr, id) => { const i = arr.findIndex((c) => c.id === id); return i < 0 ? null : arr.splice(i, 1)[0]; };
// The pile a card must go to: an empty pile is forced; otherwise the caller's choice.
const isPile = (pile) => pile === 0 || pile === 1; // untrusted input: 'constructor' etc. must not index arrays
const pileOk = (s, pile) => isPile(pile) && !(s.discards[1 - pile].length === 0 && s.discards[pile].length > 0);
export const canEnd = (s) => s.phase === 'playing' && s.step === 'play' && !s.call && playerScore(cur(s)).total >= MIN_TO_END;

// Holding all 4 Deer ends the game instantly — call after any card enters a hand.
function checkMermaid(s, p) {
  if (p.hand.filter((c) => c.type === 'deer').length < 4) return;
  log(s, `${p.name} holds all four Deer — instant win!`);
  const rows = s.players.map((q) => ({ id: q.id, name: q.name, hand: q.hand, played: q.played, breakdown: playerScore(q), gained: 0 }));
  s.result = { reason: 'mermaids', callerId: p.id, success: true, rows };
  s.phase = 'gameOver';
  s.winnerIds = [p.id];
}

export function act(s, pid, a) {
  if (!a || typeof a !== 'object') return false;
  if (a.type === 'nextRound') {
    if (s.phase !== 'roundEnd') return false;
    s.starterIdx++; startRound(s); return true;
  }
  if (s.phase !== 'playing' || cur(s).id !== pid) return false;
  const p = cur(s);

  if (s.step === 'draw') {
    if (a.type === 'draw') {
      // ponytail: deck empty when you must draw → round ends, nobody scores.
      if (!s.deck.length) { log(s, 'The deck ran out — nobody scores this round.'); endRound(s, 'void'); return true; }
      s.pending = s.deck.splice(-2).reverse();
      if (s.pending.length === 1) { p.hand.push(s.pending.pop()); s.step = 'play'; checkMermaid(s, p); }
      else s.step = 'choose';
      log(s, `${p.name} draws from the deck.`);
      return true;
    }
    if (a.type === 'take') {
      const pile = isPile(a.pile) && s.discards[a.pile];
      if (!pile?.length) return false;
      const c = pile.pop();
      p.hand.push(c);
      s.step = 'play';
      log(s, `${p.name} takes a ${CARD_TYPES[c.type].name} from pile ${a.pile + 1}.`);
      checkMermaid(s, p);
      return true;
    }
    return false;
  }

  if (s.step === 'choose') {
    if (a.type !== 'keep' || (a.index !== 0 && a.index !== 1) || !pileOk(s, a.pile)) return false;
    const [kept] = s.pending.splice(a.index, 1);
    p.hand.push(kept);
    s.discards[a.pile].push(s.pending.pop());
    s.step = 'play';
    checkMermaid(s, p);
    return true;
  }

  // Swimmer+Shark: steal one random card from a chosen opponent (one-way, no swap-back).
  if (s.step === 'steal') {
    if (a.type !== 'steal') return false;
    const t = Number.isInteger(a.target) && s.players[a.target];
    if (!t || t.id === pid || !t.hand.length) return false;
    const theirs = t.hand.splice(Math.floor(Math.random() * t.hand.length), 1)[0];
    p.hand.push(theirs);
    s.step = 'play';
    log(s, `${p.name} steals a card from ${t.name}.`);
    checkMermaid(s, p);
    return true;
  }

  // Crab: first commit to ONE pile, then take ANY card from it — the other pile stays hidden.
  if (s.step === 'fox') {
    if (a.type === 'foxPile') {
      if (!isPile(a.pile) || !s.discards[a.pile].length) return false;
      s.foxPile = a.pile;
      return true;
    }
    if (a.type !== 'fox' || s.foxPile == null) return false;
    const c = takeById(s.discards[s.foxPile], a.cardId);
    if (!c) return false;
    p.hand.push(c);
    s.step = 'play';
    log(s, `${p.name} takes a ${CARD_TYPES[c.type].name} from pile ${s.foxPile + 1}.`);
    s.foxPile = null;
    checkMermaid(s, p);
    return true;
  }

  // step === 'play'
  if (a.type === 'pair') return playPair(s, p, a.cards);
  if (a.type === 'end') { nextTurn(s); return true; }
  if (a.type === 'stop' && canEnd(s)) { log(s, `${p.name} says STOP.`); endRound(s, 'stop'); return true; }
  if (a.type === 'call' && canEnd(s)) {
    log(s, `${p.name} calls LAST CHANCE!`);
    s.call = { callerId: p.id };
    s.extraTurn = false; // ponytail: calling forfeits a pending Rabbit turn
    nextTurn(s);
    return true;
  }
  return false;
}

function playPair(s, p, ids) {
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) return false;
  const cards = ids.map((id) => p.hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return false;
  const eff = pairEffect(cards[0].type, cards[1].type);
  if (!eff) return false;
  const pair = ids.map((id) => takeById(p.hand, id));
  p.played.push(pair);
  log(s, cards[0].type === cards[1].type
    ? `${p.name} plays a pair of ${CARD_TYPES[cards[0].type].name}s.`
    : `${p.name} plays a Raccoon + Badger.`);
  if (eff === 'capybara') { if (s.deck.length) { p.hand.push(s.deck.pop()); checkMermaid(s, p); } } // Fish: draw top to hand
  else if (eff === 'steal') { if (s.players.some((q) => q.id !== p.id && q.hand.length)) s.step = 'steal'; }
  else if (eff === 'fox') { if (s.discards[0].length || s.discards[1].length) { s.step = 'fox'; s.foxPile = null; } }
  else if (eff === 'rabbit') { s.extraTurn = true; nextTurn(s); } // Boat: take the extra turn immediately, no End turn needed
  return true;
}

function nextTurn(s) {
  s.step = 'draw';
  s.pending = [];
  if (s.extraTurn) { s.extraTurn = false; log(s, `${cur(s).name} takes another turn.`); return; }
  s.currentIdx = (s.currentIdx + 1) % s.players.length;
  if (s.call && cur(s).id === s.call.callerId) endRound(s, 'call');
}

function endRound(s, reason) {
  const rows = s.players.map((p) => ({
    id: p.id, name: p.name, hand: p.hand, played: p.played, breakdown: playerScore(p), gained: 0,
  }));
  let success = null;
  if (reason === 'stop') rows.forEach((r) => (r.gained = r.breakdown.total));
  if (reason === 'call') {
    const caller = rows[s.call.callerId];
    success = rows.every((r) => r === caller || caller.breakdown.total >= r.breakdown.total);
    for (const r of rows) {
      const { total, colorBonus } = r.breakdown;
      if (r === caller) r.gained = success ? total + colorBonus : colorBonus;
      else r.gained = success ? colorBonus : total;
    }
  }
  rows.forEach((r) => (s.players[r.id].score += r.gained));
  s.result = { reason, callerId: s.call?.callerId ?? (reason === 'stop' ? cur(s).id : null), success, rows };
  const best = Math.max(...s.players.map((p) => p.score));
  if (best >= s.target) {
    s.phase = 'gameOver';
    s.winnerIds = s.players.filter((p) => p.score === best).map((p) => p.id);
  } else s.phase = 'roundEnd';
}

// ---------- public information ----------
// Snapshot for one viewer: no deck order, only pile tops, nobody else's hand or private draws.
export function publicState(s, viewerId) {
  const { deck, ...rest } = s;
  const mine = s.phase === 'playing' && cur(s).id === viewerId;
  const me = s.players[viewerId];
  return {
    ...rest,
    deckCount: deck.length,
    discards: s.discards.map((d) => ({ top: d[d.length - 1] || null, count: d.length })),
    // Crab: reveal only the pile the chooser has committed to (never both at once).
    foxPile: mine && s.step === 'fox' ? (s.foxPile ?? null) : null,
    foxCards: mine && s.step === 'fox' && s.foxPile != null ? [...s.discards[s.foxPile]] : null,
    pending: mine ? s.pending : [],
    pendingCount: s.pending.length,
    players: s.players.map((p) => ({
      id: p.id, name: p.name, score: p.score, played: p.played, handCount: p.hand.length,
      hand: p.id === viewerId ? p.hand : null,
    })),
    myScore: me ? playerScore(me) : null,
    canEnd: mine && canEnd(s),
  };
}

// ---------- bots / fuzzing ----------
export function legalActions(s) {
  if (s.phase === 'roundEnd') return [{ type: 'nextRound' }];
  if (s.phase !== 'playing') return [];
  const p = cur(s), out = [];
  const piles = [0, 1].filter((i) => s.discards[i].length);
  if (s.step === 'draw') { out.push({ type: 'draw' }); piles.forEach((pile) => out.push({ type: 'take', pile })); }
  if (s.step === 'choose') for (const index of [0, 1]) for (const pile of [0, 1]) if (pileOk(s, pile)) out.push({ type: 'keep', index, pile });
  if (s.step === 'steal') for (const t of s.players) if (t.id !== p.id && t.hand.length) out.push({ type: 'steal', target: t.id });
  if (s.step === 'fox') {
    if (s.foxPile == null) piles.forEach((pile) => out.push({ type: 'foxPile', pile }));
    else s.discards[s.foxPile].forEach((c) => out.push({ type: 'fox', cardId: c.id }));
  }
  if (s.step === 'play') {
    for (const t of ['fox', 'rabbit', 'capybara']) {
      const cs = p.hand.filter((c) => c.type === t);
      if (cs.length >= 2) out.push({ type: 'pair', cards: [cs[0].id, cs[1].id] });
    }
    const rac = p.hand.find((c) => c.type === 'raccoon'), bad = p.hand.find((c) => c.type === 'badger');
    if (rac && bad) out.push({ type: 'pair', cards: [rac.id, bad.id] });
    out.push({ type: 'end' });
    if (canEnd(s)) out.push({ type: 'stop' }, { type: 'call' });
  }
  return out;
}

// A simple bot: plays pairs, keeps cards that match its hand, ends the round once it can.
export function botAction(s) {
  const p = cur(s), acts = legalActions(s);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const want = (c) => c && p.hand.some((h) => h.type === c.type) && CARD_TYPES[c.type].kind !== 'mult';
  if (s.step === 'draw') {
    const good = acts.find((a) => a.type === 'take' && want(s.discards[a.pile].at(-1)));
    return good || acts[0];
  }
  if (s.step === 'choose') {
    const idx = want(s.pending[1]) && !want(s.pending[0]) ? 1 : 0;
    return acts.find((a) => a.index === idx);
  }
  if (s.step === 'steal') return acts[0]; // steal from the first opponent who has cards
  if (s.step === 'fox') {
    if (s.foxPile == null) return acts.find((a) => s.discards[a.pile].some(want)) || acts[0];
    return acts.find((a) => want(s.discards[s.foxPile].find((c) => c.id === a.cardId))) || acts[0];
  }
  if (s.step === 'play') {
    const pair = acts.find((a) => a.type === 'pair');
    if (pair) return pair;
    if (canEnd(s)) return { type: playerScore(p).total >= 12 ? 'call' : 'stop' };
    return { type: 'end' };
  }
  return pick(acts);
}
