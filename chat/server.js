// Tiny LAN chat server — zero dependencies, just `node server.js`.
// Clients receive events over Server-Sent Events and send via POST.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const HISTORY_LIMIT = 200;

const clients = new Map(); // id -> { res, name, color, emoji }
const history = [];

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients.values()) c.res.write(data);
}

function roster() {
  return [...clients.values()]
    .filter((c) => c.name)
    .map(({ name, color, emoji }) => ({ name, color, emoji }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e5) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const clean = (s, max) => String(s ?? "").trim().slice(0, max);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(__dirname, "index.html")).pipe(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const id = crypto.randomUUID();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    clients.set(id, { res });
    res.write(`data: ${JSON.stringify({ type: "hello", id, history, roster: roster() })}\n\n`);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => {
      clearInterval(ping);
      const c = clients.get(id);
      clients.delete(id);
      if (c?.name) {
        broadcast({ type: "system", text: `${c.emoji} ${c.name} left`, ts: Date.now() });
        broadcast({ type: "roster", roster: roster() });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/send") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const c = clients.get(body.id);
    if (!c) {
      res.writeHead(404).end();
      return;
    }

    switch (body.type) {
      case "join": {
        c.name = clean(body.name, 24) || "anon";
        c.color = clean(body.color, 20);
        c.emoji = clean(body.emoji, 8);
        broadcast({ type: "system", text: `${c.emoji} ${c.name} joined`, ts: Date.now() });
        broadcast({ type: "roster", roster: roster() });
        break;
      }
      case "msg": {
        const text = clean(body.text, 2000);
        if (!text || !c.name) break;
        const msg = {
          type: "msg",
          mid: crypto.randomUUID(),
          from: body.id,
          name: c.name,
          color: c.color,
          emoji: c.emoji,
          text,
          ts: Date.now(),
          reactions: {},
        };
        history.push(msg);
        if (history.length > HISTORY_LIMIT) history.shift();
        broadcast(msg);
        break;
      }
      case "react": {
        const msg = history.find((m) => m.mid === body.mid);
        const r = clean(body.reaction, 8);
        if (!msg || !r) break;
        const who = (msg.reactions[r] ||= []);
        const i = who.indexOf(c.name);
        i === -1 ? who.push(c.name) : who.splice(i, 1);
        if (!who.length) delete msg.reactions[r];
        broadcast({ type: "react", mid: msg.mid, reactions: msg.reactions });
        break;
      }
      case "typing":
        if (c.name) broadcast({ type: "typing", from: body.id, name: c.name });
        break;
      case "nudge":
        if (c.name) broadcast({ type: "nudge", from: body.id, name: c.name, emoji: c.emoji });
        break;
    }
    res.writeHead(204).end();
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n💬  Chat is running!\n`);
  console.log(`   On this computer:  http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) {
        console.log(`   Send to friends:   http://${a.address}:${PORT}`);
      }
    }
  }
  console.log("");
});
