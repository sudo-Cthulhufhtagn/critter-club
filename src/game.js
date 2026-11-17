// Critter Club rules engine — pure, no DOM. Host-authoritative; `act` mutates `state`
// and returns true if the action was legal.

export const COLORS = ['navy', 'teal', 'coral', 'sand', 'lilac', 'mint', 'mono'];
export const COLOR_NAMES = {
  navy: 'Navy', teal: 'Teal', coral: 'Coral', sand: 'Sand', lilac: 'Lilac', mint: 'Mint', mono: 'Black & White',
  gold: 'Gold', silver: 'Silver', rust: 'Rust', crimson: 'Crimson',
};

// THE card table: every count lives here (56 cards). Common cards cycle through COLORS;
// rare cards carry their own unique `color`.
export const CARD_TYPES = {
  capybara: { kind: 'pair', count: 10, name: 'Capybara', icon: 'capybara', text: 'Pair: peek 3, keep 1' },
  raccoon:  { kind: 'pair', count: 7,  name: 'Raccoon',  icon: 'raccoon-head', text: 'Pair: swap a card' },
  fox:      { kind: 'pair', count: 7,  name: 'Fox',      icon: 'fox', text: 'Pair: take a discard' },
  rabbit:   { kind: 'pair', count: 7,  name: 'Rabbit',   icon: 'rabbit', text: 'Pair: extra turn' },
  wombat:   { kind: 'collect', count: 6, name: 'Wombat',   icon: 'wombat', text: '1·3·6·10 for 1–4' },
  hedgehog: { kind: 'collect', count: 7, name: 'Hedgehog', icon: 'hedgehog', text: '1 per color' },
  penguin:  { kind: 'collect', count: 8, name: 'Penguin',  icon: 'penguin', text: '4 per 2' },
  owl:      { kind: 'mult', count: 1, color: 'gold',   name: 'Owl',   icon: 'barn-owl', text: '+1 per Fox' },
  koala:    { kind: 'mult', count: 1, color: 'silver', name: 'Koala', icon: 'koala', text: '+2 per Wombat' },
  bear:     { kind: 'mult', count: 1, color: 'rust',   name: 'Bear',  icon: 'bear-head', text: '+1 per Capybara or Raccoon' },
  lion:     { kind: 'special', count: 1, color: 'crimson', name: 'Lion', icon: 'lion', text: '1 per card of your top color' },
};
export const PAIR_TYPES = Object.keys(CARD_TYPES).filter((t) => CARD_TYPES[t].kind === 'pair');
export const TARGETS = { 2: 40, 3: 35, 4: 30 };
export const MIN_TO_END = 7;
const WOMBAT_PTS = [0, 1, 3, 6, 10];

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
// `cards` = hand + played cards; `pairs` = number of played pairs.
export function scoreCards(cards, pairs) {
  const n = (t) => cards.filter((c) => c.type === t).length;
  const byColor = {};
  for (const c of cards) byColor[c.color] = (byColor[c.color] || 0) + 1;
  const colorBonus = Math.max(0, ...Object.values(byColor));
  const items = [];
  const add = (label, pts) => items.push({ label, pts });
  if (pairs) add(`${pairs} pair${pairs > 1 ? 's' : ''}`, pairs);
  const w = n('wombat');
  if (w) add(`${w} Wombat`, WOMBAT_PTS[Math.min(w, 4)]);
  const hedgeColors = new Set(cards.filter((c) => c.type === 'hedgehog').map((c) => c.color)).size;
  if (hedgeColors) add(`Hedgehogs, ${hedgeColors} color${hedgeColors > 1 ? 's' : ''}`, hedgeColors);
  if (n('penguin')) add(`${n('penguin')} Penguin`, Math.floor(n('penguin') / 2) * 4);
  if (n('owl')) add(`Owl × ${n('fox')} Fox`, n('owl') * n('fox'));
  if (n('koala')) add(`Koala × ${w} Wombat`, n('koala') * 2 * w);
  if (n('bear')) add(`Bear × ${n('capybara') + n('raccoon')} Capybara/Raccoon`, n('bear') * (n('capybara') + n('raccoon')));
  if (n('lion')) add(`Lion × ${colorBonus} top color`, n('lion') * colorBonus);
  return { items, total: items.reduce((a, b) => a + b.pts, 0), colorBonus };
}
export const allCards = (p) => [...p.hand, ...p.played.flat()];
export const playerScore = (p) => scoreCards(allCards(p), p.played.length);

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
  Object.assign(s, { phase: 'playing', step: 'draw', pending: [], extraTurn: false, call: null, result: null });
  log(s, `Round ${s.round} — ${cur(s).name} starts.`);
}

const cur = (s) => s.players[s.currentIdx];
const name = (s, id) => s.players[id].name;
function log(s, msg) { s.log.push(msg); if (s.log.length > 30) s.log.shift(); }
const takeById = (arr, id) => { const i = arr.findIndex((c) => c.id === id); return i < 0 ? null : arr.splice(i, 1)[0]; };
// The pile a card must go to: an empty pile is forced; otherwise the caller's choice.
const isPile = (pile) => pile === 0 || pile === 1; // untrusted input: 'constructor' etc. must not index arrays
const pileOk = (s, pile) => isPile(pile) && !(s.discards[1 - pile].length === 0 && s.discards[pile].length > 0);
const smallerPile = (s) => (s.discards[1].length < s.discards[0].length ? 1 : 0);
export const canEnd = (s) => s.phase === 'playing' && s.step === 'play' && !s.call && playerScore(cur(s)).total >= MIN_TO_END;

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
      if (s.pending.length === 1) { p.hand.push(s.pending.pop()); s.step = 'play'; }
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
    return true;
  }

  if (s.step === 'capybara') {
    if (a.type !== 'capyKeep' || !Number.isInteger(a.index) || !s.pending[a.index]) return false;
    const [kept] = s.pending.splice(a.index, 1);
    p.hand.push(kept);
    // ponytail: the rest go to the smaller pile one by one — no per-card pile choice.
    while (s.pending.length) s.discards[smallerPile(s)].push(s.pending.pop());
    s.step = 'play';
    return true;
  }

  if (s.step === 'raccoon') {
    if (a.type !== 'raccoon') return false;
    const t = Number.isInteger(a.target) && s.players[a.target];
    if (!t || t.id === pid || !t.hand.length || !p.hand.some((c) => c.id === a.cardId)) return false;
    const mine = takeById(p.hand, a.cardId);
    const theirs = t.hand.splice(Math.floor(Math.random() * t.hand.length), 1)[0];
    p.hand.push(theirs); t.hand.push(mine);
    s.step = 'play';
    log(s, `${p.name} swaps a card with ${t.name}.`);
    return true;
  }

  if (s.step === 'fox') {
    if (a.type !== 'fox' || !isPile(a.pile) || !s.discards[a.pile].length) return false;
    const c = s.discards[a.pile].pop();
    p.hand.push(c);
    s.step = 'play';
    log(s, `${p.name} takes a ${CARD_TYPES[c.type].name} from pile ${a.pile + 1}.`);
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
  if (cards.some((c) => !c) || cards[0].type !== cards[1].type || !PAIR_TYPES.includes(cards[0].type)) return false;
  const pair = ids.map((id) => takeById(p.hand, id));
  p.played.push(pair);
  const type = pair[0].type;
  log(s, `${p.name} plays a pair of ${CARD_TYPES[type].name}s.`);
  if (type === 'capybara' && s.deck.length) { s.pending = s.deck.splice(-3).reverse(); s.step = 'capybara'; }
  else if (type === 'raccoon' && p.hand.length && s.players.some((q) => q.id !== p.id && q.hand.length)) s.step = 'raccoon';
  else if (type === 'fox' && (s.discards[0].length || s.discards[1].length)) s.step = 'fox';
  else if (type === 'rabbit') s.extraTurn = true;
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
  if (s.step === 'capybara') s.pending.forEach((_, index) => out.push({ type: 'capyKeep', index }));
  if (s.step === 'raccoon') for (const t of s.players) if (t.id !== p.id && t.hand.length) for (const c of p.hand) out.push({ type: 'raccoon', target: t.id, cardId: c.id });
  if (s.step === 'fox') piles.forEach((pile) => out.push({ type: 'fox', pile }));
  if (s.step === 'play') {
    for (const t of PAIR_TYPES) {
      const cs = p.hand.filter((c) => c.type === t);
      if (cs.length >= 2) out.push({ type: 'pair', cards: [cs[0].id, cs[1].id] });
    }
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
  if (s.step === 'capybara') {
    const i = s.pending.findIndex(want);
    return { type: 'capyKeep', index: Math.max(0, i) };
  }
  if (s.step === 'play') {
    const pair = acts.find((a) => a.type === 'pair');
    if (pair) return pair;
    if (canEnd(s)) return { type: playerScore(p).total >= 12 ? 'call' : 'stop' };
    return { type: 'end' };
  }
  return pick(acts);
}
