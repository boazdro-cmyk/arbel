// SuperBoth Multiplayer Relay Server
// Deploy this on Render (or any Node.js host) as a Web Service.
//   Build command: npm install
//   Start command: node server.js
// The server does NOT simulate the match - it just relays messages between
// exactly 2 connected players in the same room. The HOST player (whoever
// created the room) runs the authoritative ball physics; the GUEST just
// controls their own player and receives ball/opponent updates from the host.

const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// rooms: Map<roomId, { id, name, isPrivate, code, hostSocket, guestSocket, hostName, guestName, state: 'waiting'|'full' }>
const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while ([...rooms.values()].some(r => r.code === code));
  return code;
}

function publicRoomList() {
  return [...rooms.values()]
    .filter(r => !r.isPrivate && r.state === 'waiting')
    .map(r => ({ id: r.id, name: r.name, hostName: r.hostName }));
}

function broadcastRoomList() {
  const list = JSON.stringify({ type: 'roomList', rooms: publicRoomList() });
  for (const client of lobbyClients) {
    if (client.readyState === WebSocket.OPEN) client.send(list);
  }
}

const lobbyClients = new Set(); // sockets currently browsing the room list (not yet in a room)

function send(sock, obj) {
  if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(obj));
}

function removeFromLobby(sock) { lobbyClients.delete(sock); }

function closeRoom(room, reason) {
  send(room.hostSocket, { type: 'opponentLeft', reason });
  send(room.guestSocket, { type: 'opponentLeft', reason });
  rooms.delete(room.id);
  broadcastRoomList();
}

const server = http.createServer((req, res) => {
  // simple health check endpoint (useful for Render)
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SuperBoth multiplayer relay is running.');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (sock) => {
  sock.room = null;
  sock.role = null; // 'host' | 'guest'
  lobbyClients.add(sock);
  send(sock, { type: 'roomList', rooms: publicRoomList() });

  sock.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'createRoom': {
        if (sock.room) { closeRoom(sock.room, 'Host started a new room.'); }
        removeFromLobby(sock);
        const id = crypto.randomBytes(6).toString('hex');
        const isPrivate = !!msg.isPrivate;
        const room = {
          id, name: (msg.name || 'Match').slice(0, 24), isPrivate,
          code: isPrivate ? makeCode() : null,
          hostSocket: sock, guestSocket: null,
          hostName: (msg.playerName || 'Host').slice(0, 16), guestName: null,
          state: 'waiting'
        };
        rooms.set(id, room);
        sock.room = room; sock.role = 'host';
        send(sock, { type: 'roomCreated', id, code: room.code, isPrivate });
        if (!isPrivate) broadcastRoomList();
        break;
      }
      case 'joinRoom': {
        let room = null;
        if (msg.code) {
          const code = String(msg.code).toUpperCase();
          room = [...rooms.values()].find(r => r.code === code && r.state === 'waiting');
          if (!room) { send(sock, { type: 'joinError', reason: 'No room found with that code.' }); return; }
        } else if (msg.id) {
          room = rooms.get(msg.id);
          if (!room || room.state !== 'waiting') { send(sock, { type: 'joinError', reason: 'That room is no longer available.' }); return; }
        } else { return; }
        if (sock.room && sock.room !== room) { closeRoom(sock.room, 'Player left to join another room.'); }
        removeFromLobby(sock);
        room.guestSocket = sock; room.guestName = (msg.playerName || 'Guest').slice(0, 16);
        room.state = 'full';
        sock.room = room; sock.role = 'guest';
        send(room.hostSocket, { type: 'opponentJoined', opponentName: room.guestName });
        send(sock, { type: 'joined', opponentName: room.hostName, id: room.id });
        broadcastRoomList();
        break;
      }
      case 'leaveLobby': { removeFromLobby(sock); break; }
      case 'backToLobby': { lobbyClients.add(sock); send(sock, { type: 'roomList', rooms: publicRoomList() }); break; }
      // Generic relay: anything else (team pick, player input, ball state, goals, chat...)
      // just gets forwarded verbatim to whichever socket is the OTHER player in the room.
      default: {
        const room = sock.room;
        if (!room) return;
        const other = sock.role === 'host' ? room.guestSocket : room.hostSocket;
        send(other, msg);
      }
    }
  });

  sock.on('close', () => {
    removeFromLobby(sock);
    const room = sock.room;
    if (!room) return;
    closeRoom(room, sock.role === 'host' ? 'Host disconnected.' : 'Opponent left.');
  });
});

server.listen(PORT, () => console.log('SuperBoth multiplayer relay listening on port ' + PORT));
