// ws_echo_server.js — echoes every message back with an added server-side timestamp
// Install: npm install ws
// Run:     node ws_echo_server.js [port]   (default 8080)
const { WebSocketServer } = require('ws');
const port = parseInt(process.argv[2] || '8080', 10);
const wss = new WebSocketServer({ port });
console.log(`WS echo server listening on ws://0.0.0.0:${port}`);
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      msg.server_ts = Date.now();   // millisecond timestamp when server received the message
      ws.send(JSON.stringify(msg)); // echo the full object back to the client
    } catch { ws.send(raw); }      // non-JSON: echo verbatim (keeps the server generic)
  });
});
