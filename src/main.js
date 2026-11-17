import './style.css';
import * as game from './game.js';
import { iconSVG } from './icons.js';
import { createHost, createClient } from './net.js';
import qrcode from 'qrcode-generator';

const { CARD_TYPES, COLOR_NAMES } = game;
const LS = 'critterclub:name';
const BOT_NAMES = ['Pip', 'Moss', 'Fern'];
const MAX = 4;
// Original colorblind markers (not ColorADD): a distinct shape per common color, chemical-style codes for the uniques.
const MARKS = { navy: '■', teal: '▲', coral: '●', sand: '◆', lilac: '★', mint: '✚', mono: '◐', gold: 'Au', silver: 'Ag', rust: 'Fe', crimson: 'Cr' };
const MULT_OF = { owl: 'rabbit', koala: 'capybara', bear: 'penguin', lion: 'mole' };
let mineCards = [], ownIds = new Set(); // viewer's hand + played cards (for personalised hover points)

// ---------- runtime state ----------
let mode = 'local';        // 'local' (you + bots) | 'host' | 'client'
let menu = 'start';        // 'start' | 'host' | 'join' | null
let state = null;          // authoritative game (local/host only)
let view = null;           // what we render: lobby object or a publicState snapshot
let myId = 0;
let net = null, code = null, incomingCode = '';
let lobbyPlayers = [];     // [{ name, bot, connId }] — seat order = player id
let connPlayer = new Map();// host: connId -> player id
let bots = new Set();      // player ids the host plays for
let botTimer = null;
let sel = [];              // selected hand card ids
let pendSel = null;        // index of the drawn card chosen to keep
let seen = new Set(), seenPlayed = new Set(), seenRound = -1; // card ids already on screen (for enter animations)

const $ = (id) => document.getElementById(id);
const app = $('app');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const myName = () => { try { return localStorage.getItem(LS) || ''; } catch { return ''; } };
const saveName = (n) => { try { localStorage.setItem(LS, n); } catch {} };
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

// ---------- host / local engine ----------
const snapFor = (pid) => ({ ...game.publicState(state, pid), bots: [...bots] });
function sync() {
  if (mode === 'host') connPlayer.forEach((pid, cid) => net.sendTo(cid, { type: 'state', snap: snapFor(pid) }));
  view = snapFor(myId);
  render();
  scheduleBot();
}
function scheduleBot() {
  clearTimeout(botTimer);
  if (!state || state.phase !== 'playing') return;
  const pid = state.players[state.currentIdx].id;
  if (!bots.has(pid)) return;
  botTimer = setTimeout(() => { if (game.act(state, pid, game.botAction(state))) sync(); }, 750);
}
function send(action) {
  sel = []; pendSel = null;
  if (mode === 'client') { net.send({ type: 'act', action }); return; }
  if (game.act(state, myId, action)) sync(); else { toast("Can't do that"); render(); }
}

function lobbyChanged() {
  connPlayer = new Map(lobbyPlayers.map((p, i) => [p.connId, i]).filter(([c]) => c));
  view = { phase: 'lobby', players: lobbyPlayers.map(({ name, bot }) => ({ name, bot })), code };
  if (mode === 'host') connPlayer.forEach((pid, cid) => net.sendTo(cid, { type: 'lobby', lobby: view, youId: pid }));
  render();
}
function onIntent(connId, msg) {
  if (msg?.type === 'join') {
    if (lobbyPlayers.some((p) => p.connId === connId)) return; // ignore repeat joins
    if (state || lobbyPlayers.length >= MAX) { net.sendTo(connId, { type: 'full' }); return; } // ponytail: no mid-game joins
    lobbyPlayers.push({ name: String(msg.name || 'Player').slice(0, 16), bot: false, connId });
    lobbyChanged();
    return;
  }
  const pid = connPlayer.get(connId);
  if (msg?.type === 'act' && state && pid != null && msg.action?.type !== 'nextRound' && game.act(state, pid, msg.action)) sync();
}
function onConnClosed(connId) {
  if (connId == null) return render();
  const pid = connPlayer.get(connId);
  if (pid == null) return;
  if (!state) { lobbyPlayers.splice(pid, 1); lobbyChanged(); return; }
  // A player who leaves mid-game is taken over by a bot so the table can finish.
  lobbyPlayers[pid] = { name: lobbyPlayers[pid].name, bot: true };
  connPlayer.delete(connId); bots.add(pid);
  toast(`${lobbyPlayers[pid].name} left — a bot takes over`);
  sync();
}

function startGame() {
  bots = new Set(lobbyPlayers.flatMap((p, i) => (p.bot ? [i] : [])));
  state = game.startGame(lobbyPlayers.map((p) => p.name));
  sync();
}
function backToLobby() {
  clearTimeout(botTimer);
  state = null;
  lobbyChanged();
}
function hostGame(name) {
  saveName(name);
  code = genCode(); mode = 'host'; myId = 0; menu = null;
  lobbyPlayers = [{ name: name || 'Host', bot: false }];
  net = createHost(code, onIntent, onConnClosed, (e) => {
    if (e?.type === 'unavailable-id') { net.destroy(); hostGame(name); } // code taken — roll a new one
    else toast('Connection error' + (e?.type ? ': ' + e.type : ''));
  });
  lobbyChanged();
}
function joinGame(name, c) {
  c = c.trim().toUpperCase();
  if (!c) return toast('Enter a room code');
  saveName(name);
  mode = 'client'; menu = null; code = c;
  view = { phase: 'lobby', players: [], code: c };
  net = createClient(c, name || 'Player', onClientData, (s, e) => {
    if (s === 'connected') toast('Connected');
    else if (s === 'closed') toast('Disconnected from host');
    else if (s === 'error') {
      if (e?.type === 'peer-unavailable') { net.destroy(); menu = 'join'; toast('No room with that code'); render(); }
      else toast('Connection error' + (e?.type ? ': ' + e.type : ''));
    }
  });
  render();
}
function onClientData(msg) {
  if (msg.type === 'lobby') { myId = msg.youId; view = msg.lobby; }
  else if (msg.type === 'state') view = msg.snap;
  else if (msg.type === 'full') { toast('That room is full or already playing'); net.destroy(); menu = 'join'; }
  render();
}
function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function goHome() {
  clearTimeout(botTimer); net?.destroy(); net = null;
  mode = 'local'; state = null; view = null; menu = 'start'; myId = 0;
  render();
}

// ---------- card HTML ----------
function ruleText(c) {
  const d = CARD_TYPES[c.type];
  if (d.kind === 'duo') return c.type === 'raccoon' || c.type === 'badger' ? '1 point per Raccoon + Badger pair' : `1 point per pair of ${d.name}s`;
  if (d.kind === 'collect') return `${d.name}s score ${d.text}`;
  if (d.kind === 'mult') return `${d.name}: ${d.text.replace(/^(\d)/, (n) => n + (n === '1' ? ' point' : ' points'))} (multiplier)`;
  return 'Deer score your next-largest color group (counts as Black & White)';
}
function contrib(c) {
  if (!ownIds.has(c.id)) return '';
  const d = CARD_TYPES[c.type];
  if (d.kind === 'mermaid') { const it = view.myScore?.items.find((i) => /Deer$/.test(i.label)); return it ? ` You score ${it.pts} from your Deer now.` : ''; }
  const t = d.kind === 'mult' ? [c.type, MULT_OF[c.type]] : c.type === 'raccoon' || c.type === 'badger' ? ['raccoon', 'badger'] : [c.type];
  return ` This group scores you ${game.scoreCards(mineCards.filter((x) => t.includes(x.type))).total} now.`;
}
function cardHTML(c, { cls = '', act = '', attrs = '', quiet = false } = {}) {
  const d = CARD_TYPES[c.type], col = COLOR_NAMES[c.color], tip = ruleText(c) + '.' + contrib(c);
  const tag = act ? 'button' : 'div';
  const enter = quiet || seen.has(c.id) ? '' : ' enter';
  return `<${tag} class="card col-${c.color}${enter} ${cls}" ${act ? `data-act="${act}"` : 'role="group"'} data-id="${c.id}" ${attrs}
    aria-label="${esc(`${d.name}, ${col}, marker ${MARKS[c.color]}. ${tip}`)}" data-tip="${esc(tip)}">
    <span class="ctop"><b>${d.name}</b><i class="pip" aria-hidden="true">${MARKS[c.color]}</i></span>
    ${iconSVG(d.icon)}
    <span class="ctext">${d.text}</span>
  </${tag}>`;
}
const miniHTML = (c) => `<span class="chip col-${c.color}" title="${CARD_TYPES[c.type].name}">${iconSVG(CARD_TYPES[c.type].icon)}</span>`;
const playedCard = (c) => cardHTML(c, { cls: 'sm', quiet: true });
const pairsHTML = (played) => played.map((pr) => `<span class="pairgrp${pr.some((c) => seenPlayed.has(c.id)) ? '' : ' pop'}">${pr.map(playedCard).join('')}</span>`).join('');
const backs = (n) => Array.from({ length: Math.min(n, 12) }, () => '<span class="back"></span>').join('');
const sortHand = (h) => [...h].sort((a, b) => Object.keys(CARD_TYPES).indexOf(a.type) - Object.keys(CARD_TYPES).indexOf(b.type) || a.color.localeCompare(b.color));

// ---------- render ----------
function render() {
  const me = view?.players?.[myId];
  mineCards = me?.hand ? [...me.hand, ...me.played.flat()] : []; ownIds = new Set(mineCards.map((c) => c.id));
  $('logBtn').hidden = !!menu || !view?.log;
  if ($('logDlg').open) fillLog();
  if (menu) renderMenu();
  else if (view.phase === 'lobby') renderLobby();
  else {
    if (view.round !== seenRound) { seen = new Set(); seenPlayed = new Set(); seenRound = view.round; }
    if (view.phase === 'playing') renderTable();
    else if (view.phase === 'roundEnd') renderRoundEnd();
    else renderGameOver();
    app.querySelectorAll('[data-id]').forEach((el) => seen.add(+el.dataset.id));
    view.players.forEach((p) => p.played.flat().forEach((c) => seenPlayed.add(c.id)));
  }
}

function renderMenu() {
  const sample = [{ id: -1, type: 'wombat', color: 'sand' }, { id: -2, type: 'fox', color: 'coral' }, { id: -3, type: 'penguin', color: 'navy' }];
  if (menu === 'start') {
    app.innerHTML = `<div class="panel menu">
      <div class="fanned">${sample.map((c) => cardHTML(c)).join('')}</div>
      <h1>Critter Club</h1>
      <p class="muted">Collect critters, play pairs for their tricks, and know when to call it.</p>
      <button class="primary big" data-act="menu-bots">Play vs bots</button>
      <button class="secondary big" data-act="menu-host">Host an online game</button>
      <button class="secondary big" data-act="menu-join">Join with a code</button>
      <button class="link" data-act="help">How to play</button>
    </div>`;
  } else {
    const join = menu === 'join';
    app.innerHTML = `<div class="panel menu">
      <h2>${join ? 'Join a game' : 'Host a game'}</h2>
      <label class="field">Your name <input id="fName" maxlength="16" value="${esc(myName())}" placeholder="Name"></label>
      ${join ? `<label class="field">Room code <input id="fCode" maxlength="4" class="code-in" value="${esc(incomingCode)}" placeholder="ABCD"></label>` : ''}
      <button class="primary big" data-act="${join ? 'join-go' : 'host-go'}">${join ? 'Join' : 'Create room'}</button>
      <button class="link" data-act="home">← Back</button>
    </div>`;
  }
}

function renderLobby() {
  const editable = mode !== 'client';
  const n = view.players.length;
  app.innerHTML = `<div class="panel">
    <h1>Critter Club</h1>
    ${view.code && mode !== 'local' ? `<p class="muted">Room code <b class="code">${esc(view.code)}</b></p>` : ''}
    ${mode === 'host' ? `<div class="share"><img id="qr" alt="QR code to join"><button class="secondary" data-act="copy">Copy join link</button></div>` : ''}
    <div class="plist">${view.players.map((p, i) => `<div class="prow">
      ${editable && i === myId && !p.bot ? `<input class="nm" value="${esc(p.name)}" maxlength="16">` : `<span class="pname">${esc(p.name)}${p.bot ? ' <small>bot</small>' : ''}${i === myId ? ' <small>you</small>' : ''}</span>`}
      ${editable && p.bot ? `<button class="mini" data-act="rm" data-i="${i}" aria-label="Remove">✕</button>` : ''}
    </div>`).join('') || '<p class="muted">Connecting…</p>'}</div>
    ${editable && n < MAX ? '<button class="secondary" data-act="add-bot">+ Add bot</button>' : ''}
    ${editable ? `<button class="primary big" data-act="start" ${n < 2 ? 'disabled' : ''}>Start game</button>
      <p class="muted">2–4 players · first to ${game.TARGETS[Math.max(2, n)]} points wins</p>`
      : '<p class="muted">Waiting for the host to start…</p>'}
    <button class="link" data-act="home">Leave</button>
  </div>`;
  if (mode === 'host') {
    const qr = qrcode(0, 'M'); qr.addData(joinUrl()); qr.make();
    $('qr').src = qr.createDataURL(4, 8);
  }
}
function joinUrl() {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('join', code);
  return u.toString();
}

function renderTable() {
  const v = view, me = v.players[myId], cur = v.players[v.currentIdx];
  const myTurn = cur.id === myId, step = myTurn ? v.step : null;
  const bot = (id) => v.bots?.includes(id);
  const opps = v.players.filter((p) => p.id !== myId);
  const pileGlow = (i) => step === 'draw' ? v.discards[i].count > 0
    : step === 'choose' && pendSel != null && !(v.discards[1 - i].count === 0 && v.discards[i].count > 0); // an empty pile is forced

  let prompt = '', buttons = '', pending = '';
  if (!myTurn) prompt = `${esc(cur.name)}${bot(cur.id) ? ' (bot)' : ''} is playing…` + (v.pendingCount ? ' looking at cards' : '');
  else if (step === 'draw') prompt = v.deckCount ? 'Draw 2 from the deck, or take the top of a discard pile.' : 'Deck empty! Take a discard — drawing now ends the round with no score.';
  else if (step === 'choose') {
    prompt = pendSel == null ? 'Tap the card to keep.' : 'Now tap a discard pile for the other card.';
    pending = v.pending.map((c, i) => cardHTML(c, { act: 'pend', cls: pendSel === i ? 'sel' : '', attrs: `data-i="${i}"` })).join('');
  } else if (step === 'steal') {
    prompt = 'Raccoon + Badger: steal a random card from an opponent.';
    buttons = opps.filter((p) => p.handCount).map((p) => `<button class="secondary" data-act="steal" data-target="${p.id}">Steal from ${esc(p.name)}</button>`).join('');
  } else if (step === 'fox') {
    if (v.foxPile == null) {
      prompt = 'Fox: choose one pile to look through.';
      buttons = [0, 1].filter((i) => v.discards[i].count).map((i) =>
        `<button class="secondary" data-act="foxpile" data-pile="${i}">Look through Pile ${i + 1} (${v.discards[i].count})</button>`).join('');
    } else {
      prompt = `Fox: take any card from Pile ${v.foxPile + 1}.`;
      pending = `<div class="pilegroup"><span class="plabel">Pile ${v.foxPile + 1}</span><div class="pcards">${(v.foxCards || []).map((c) => cardHTML(c, { act: 'foxpick' })).join('')}</div></div>`;
    }
  } else if (step === 'play') {
    const selCards = sel.map((id) => me.hand.find((c) => c.id === id));
    const pairOk = selCards.length === 2 && !!game.pairEffect(selCards[0].type, selCards[1].type);
    prompt = v.extraTurn ? 'Rabbit: you get another turn after this one. ' : '';
    prompt += 'Play a pair: two matching Foxes, Rabbits or Capybaras — or a Raccoon + Badger.';
    buttons = `<button class="secondary" data-act="pair" ${pairOk ? '' : 'disabled'}>Play pair</button>
      <button class="primary" data-act="end">End turn</button>
      ${v.canEnd ? `<button class="warn" data-act="stop">Stop</button><button class="danger" data-act="call">Last Chance</button>` : ''}`;
  }

  app.innerHTML = `<div class="table">
    <div class="opps">${opps.map((p) => `<div class="opp${p.id === cur.id ? ' turn' : ''}">
      <div class="oname">${esc(p.name)}${bot(p.id) ? ' <small>bot</small>' : ''}${v.call?.callerId === p.id ? ' <span class="badge">Last Chance</span>' : ''}</div>
      <div class="ometa">${p.score} pts · ${p.handCount} in hand</div>
      <div class="backs">${backs(p.handCount)}</div>
      <div class="pairs">${pairsHTML(p.played)}</div>
    </div>`).join('')}</div>

    <div class="mid">
      <button class="pile deck${step === 'draw' ? ' glow' : ''}" data-act="deck" ${step === 'draw' ? '' : 'disabled'}>
        <span class="back big"></span><span class="cnt">${v.deckCount}</span></button>
      ${v.discards.map((d, i) => `<button class="pile${pileGlow(i) ? ' glow' : ''}" data-act="pile" data-pile="${i}" ${pileGlow(i) ? '' : 'disabled'}>
        ${d.top ? cardHTML(d.top) : '<span class="slot">empty</span>'}<span class="cnt">${d.count}</span></button>`).join('')}
    </div>
    ${v.call ? `<div class="banner">${esc(v.players[v.call.callerId].name)} called Last Chance — final turns!</div>` : ''}
    <div class="log">${v.log.slice(-2).map(esc).join('<br>')}</div>

    <div class="prompt${myTurn ? ' mine' : ''}">${prompt}</div>
    ${pending ? `<div class="pending">${pending}</div>` : ''}
    ${buttons ? `<div class="actions">${buttons}</div>` : ''}

    <div class="me${myTurn ? ' turn' : ''}">
      <div class="mehead"><b>${esc(me.name)}</b> · ${me.score} pts
        <details class="myscore"><summary>This round: <b>${v.myScore.total}</b> + color ${v.myScore.colorBonus}</summary>
          ${v.myScore.items.map((it) => `<div>${esc(it.label)}: ${it.pts}</div>`).join('') || '<div>No points yet</div>'}
          <div class="muted">Stop / Last Chance needs ${game.MIN_TO_END}+</div></details>
      </div>
      <div class="pairs mine">${pairsHTML(me.played)}</div>
      <div class="hand" style="--n:${me.hand.length}">${sortHand(me.hand).map((c, i, a) =>
        cardHTML(c, { act: 'hand', cls: sel.includes(c.id) ? 'sel' : '', attrs: `style="--r:${(i - (a.length - 1) / 2) * Math.min(5, 30 / a.length)}deg"` })).join('')}</div>
    </div>
  </div>`;
}

function reasonText(r) {
  const n = (id) => esc(view.players[id].name);
  if (r.reason === 'void') return 'The deck ran out — nobody scores this round.';
  if (r.reason === 'mermaids') return `${n(r.callerId)} collected all four Deer and wins the game instantly!`;
  if (r.reason === 'stop') return `${n(r.callerId)} stopped. Everyone scores their cards (no color bonus).`;
  return r.success
    ? `${n(r.callerId)}'s Last Chance worked! They score cards + color bonus; everyone else scores only their color bonus.`
    : `${n(r.callerId)}'s Last Chance failed! They score only their color bonus; everyone else scores their cards.`;
}
function resultRows() {
  return view.result.rows.map((r) => `<div class="rrow">
    <div class="rhead"><b>${esc(r.name)}</b><span class="gain">+${r.gained}</span><span class="muted">${view.players[r.id].score} total</span></div>
    <div class="rcards">${[...r.played.flat(), ...sortHand(r.hand)].map(playedCard).join('')}</div>
    <div class="rbreak">${r.breakdown.items.map((it) => `${esc(it.label)} <b>${it.pts}</b>`).join(' · ') || 'no points'} · cards <b>${r.breakdown.total}</b> · color bonus <b>${r.breakdown.colorBonus}</b></div>
  </div>`).join('');
}
function renderRoundEnd() {
  app.innerHTML = `<div class="panel wide">
    <h2>Round ${view.round}</h2>
    <p>${reasonText(view.result)}</p>
    ${resultRows()}
    <p class="muted">First to ${view.target} wins.</p>
    ${mode === 'client' ? '<p class="muted">Waiting for the host…</p>' : '<button class="primary big" data-act="next">Next round</button>'}
  </div>`;
}
function renderGameOver() {
  const winners = view.winnerIds.map((id) => esc(view.players[id].name)).join(' & ');
  const standings = [...view.players].sort((a, b) => b.score - a.score);
  app.innerHTML = `<div class="panel wide">
    <h1 class="win">${winners} win${view.winnerIds.length > 1 ? '' : 's'}!</h1>
    <p>${reasonText(view.result)}</p>
    ${resultRows()}
    <h3>Final scores</h3>
    <ol class="standings">${standings.map((p) => `<li>${esc(p.name)} — <b>${p.score}</b></li>`).join('')}</ol>
    ${mode === 'client' ? '<p class="muted">Waiting for the host…</p>' : '<button class="primary big" data-act="again">Play again</button>'}
    <button class="link" data-act="home">Leave</button>
  </div>`;
}

// ---------- input ----------
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act, i = +el.dataset.i;
  switch (a) {
    case 'menu-bots':
      mode = 'local'; menu = null; code = null; myId = 0;
      lobbyPlayers = [{ name: myName() || 'Player', bot: false }, { name: BOT_NAMES[0], bot: true }];
      return lobbyChanged();
    case 'menu-host': menu = 'host'; return render();
    case 'menu-join': menu = 'join'; return render();
    case 'host-go': return hostGame($('fName').value.trim().slice(0, 16));
    case 'join-go': return joinGame($('fName').value.trim().slice(0, 16), $('fCode').value);
    case 'home': return goHome();
    case 'help': return $('help').showModal();
    case 'add-bot': {
      const used = new Set(lobbyPlayers.map((p) => p.name));
      lobbyPlayers.push({ name: BOT_NAMES.find((b) => !used.has(b)) || 'Bot', bot: true });
      return lobbyChanged();
    }
    case 'rm': lobbyPlayers.splice(i, 1); return lobbyChanged();
    case 'start': return startGame();
    case 'copy': return navigator.clipboard?.writeText(joinUrl()).then(() => toast('Link copied'), () => toast(joinUrl()));
    case 'deck': return send({ type: 'draw' });
    case 'pile': {
      const pile = +el.dataset.pile;
      if (view.step === 'draw') return send({ type: 'take', pile });
      if (view.step === 'choose' && pendSel != null) return send({ type: 'keep', index: pendSel, pile });
      return;
    }
    case 'pend': pendSel = i; return render();
    case 'foxpile': return send({ type: 'foxPile', pile: +el.dataset.pile });
    case 'foxpick': return send({ type: 'fox', cardId: +el.dataset.id });
    case 'hand': {
      const id = +el.dataset.id;
      if (view.step === 'play') sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-2);
      return render();
    }
    case 'steal': return send({ type: 'steal', target: +el.dataset.target });
    case 'pair': return send({ type: 'pair', cards: sel });
    case 'end': case 'stop': case 'call': return send({ type: a });
    case 'next': return send({ type: 'nextRound' });
    case 'again': return backToLobby();
  }
});
app.addEventListener('input', (e) => {
  if (!e.target.classList.contains('nm')) return;
  lobbyPlayers[myId].name = e.target.value.slice(0, 16);
  saveName(lobbyPlayers[myId].name);
  view.players[myId].name = lobbyPlayers[myId].name; // no re-render → keep focus
  if (mode === 'host') connPlayer.forEach((pid, cid) => net.sendTo(cid, { type: 'lobby', lobby: view, youId: pid }));
});

// ---------- help ----------
$('helpCards').innerHTML = Object.entries(CARD_TYPES).map(([type, d]) =>
  `<div class="hcard">${miniHTML({ type, color: d.color || 'mono' })}<div><b>${d.name}</b> ×${d.count} — ${d.text}</div></div>`).join('');
const legendItem = (col, label) => `<div class="lg col-${col}"><span class="sw">${MARKS[col]}</span><span>${label}</span></div>`;
$('helpColors').innerHTML = game.COLORS.map((c) => legendItem(c, COLOR_NAMES[c])).join('')
  + Object.values(CARD_TYPES).filter((d) => d.kind === 'mult').map((d) => legendItem(d.color, `${COLOR_NAMES[d.color]} = ${d.name}`)).join('');
function fillLog() { $('logList').innerHTML = [...(view?.log || [])].reverse().map((l) => `<li>${esc(l)}</li>`).join(''); }
$('logBtn').onclick = () => { fillLog(); $('logDlg').showModal(); };
$('helpBtn').onclick = () => $('help').showModal();

// ---------- boot ----------
const params = new URLSearchParams(location.search);
if (params.get('join')) {
  incomingCode = params.get('join').toUpperCase().slice(0, 4);
  menu = 'join';
  history.replaceState(null, '', location.pathname);
}
render();
