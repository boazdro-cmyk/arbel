# SuperBoth multiplayer relay server

A small Node.js WebSocket server that lets two players find each other and
play a 1v1 match. It does NOT run the match itself - the host player's
browser simulates the game, and this server just relays messages between
the two connected players (room list, join-by-code, and in-game state).

## Deploy on Render

1. Push this folder to a GitHub repo (or use Render's "public Git repo" option).
2. On Render: **New +** → **Web Service** → connect the repo.
3. Settings:
   - **Environment**: Node
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Instance type**: Free is fine to start.
4. Once deployed, Render gives you a URL like `https://your-app.onrender.com`.
   The game connects over WebSocket, so use `wss://your-app.onrender.com`
   (note the `wss://`, not `https://`) as the server address inside the game's
   Multiplayer screen.

## Run locally (for testing)

```bash
npm install
npm start
```

Server listens on `http://localhost:3000` (WebSocket at `ws://localhost:3000`).

## Notes

- Free Render web services "sleep" after inactivity and take a few seconds
  to wake up on the next connection - the first player to connect after a
  quiet period may see a short delay before the room list loads.
- Rooms are all in-memory - if the server restarts, all open rooms are lost
  (players just need to create/join again).
