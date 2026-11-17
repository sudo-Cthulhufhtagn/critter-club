// PeerJS transport (same pattern as mole-poker). Host is authoritative and sends each
// player their own redacted snapshot; clients only send intents.
// Uses the default public PeerJS broker — works from static HTTPS Pages, no backend.
import { Peer } from 'peerjs';

const PREFIX = 'critterclub-';

export function createHost(code, onIntent, onChange, onError) {
  const peer = new Peer(PREFIX + code);
  const conns = new Map();
  peer.on('error', onError);
  peer.on('connection', (conn) => {
    conn.on('open', () => { conns.set(conn.peer, conn); onChange(); });
    conn.on('data', (d) => onIntent(conn.peer, d));
    conn.on('close', () => { conns.delete(conn.peer); onChange(conn.peer); });
  });
  return {
    sendTo: (id, msg) => conns.get(id)?.send(msg),
    count: () => conns.size,
    destroy: () => peer.destroy(),
  };
}

export function createClient(code, name, onData, onStatus) {
  const peer = new Peer();
  let conn = null;
  peer.on('error', (e) => onStatus('error', e));
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true });
    conn.on('open', () => { conn.send({ type: 'join', name }); onStatus('connected'); });
    conn.on('data', onData);
    conn.on('close', () => onStatus('closed'));
  });
  return { send: (msg) => conn?.send(msg), destroy: () => peer.destroy() };
}
