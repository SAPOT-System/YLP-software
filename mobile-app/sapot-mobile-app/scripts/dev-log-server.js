#!/usr/bin/env node
// Development log collector.
//
// Receives log lines POSTed by the mobile app's laptopLogTransport
// (features/shared/utils/logger.ts) while running in __DEV__ and appends them to
// per-dev-client files on the laptop: dev-logs/dev-<metroPort>.log
//
// Each Metro/dev-server port (8081, 8082, ...) gets its own file, so logs from
// concurrent development clients stay separated.
//
// Usage:  npm run log-server   (or: node scripts/dev-log-server.mjs)
// Env:    LOG_SERVER_PORT (default 19000) — must match EXPO_PUBLIC_LOG_SERVER_PORT.

import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.LOG_SERVER_PORT ?? 19000);
const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const LOG_DIR = path.join(ROOT, "dev-logs");

fs.mkdirSync(LOG_DIR, { recursive: true });

const sanitizePort = (value) => (value ?? "unknown").replace(/[^0-9A-Za-z_-]/g, "");

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/log")) {
    const { searchParams } = new URL(req.url, "http://localhost");
    const clientPort = sanitizePort(searchParams.get("port"));
    const file = path.join(LOG_DIR, `dev-${clientPort}.log`);

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      fs.appendFile(file, body, (err) => {
        if (err) console.error(`[log-server] failed to write ${file}:`, err.message);
      });
      res.writeHead(204);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// Bind to 0.0.0.0 so physical devices on the LAN can reach the collector.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[log-server] listening on http://0.0.0.0:${PORT}`);
  console.log(`[log-server] writing logs to ${LOG_DIR}/dev-<port>.log`);
  console.log(
    "[log-server] Android emulator? run: adb reverse tcp:" + PORT + " tcp:" + PORT,
  );
});
