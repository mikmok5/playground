# playground

## 💬 Bubble Chat — a LAN texting app

A tiny, zero-dependency group chat you run on your own computer and share with friends on the same Wi-Fi.

```sh
cd chat
node server.js        # needs Node 18+; set PORT=4000 to change the port
```

It prints something like:

```
   On this computer:  http://localhost:3000
   Send to friends:   http://192.168.1.23:3000
```

Send the "Send to friends" link to anyone on the same network.

**Fun stuff:** emoji avatars + colors, double-click (or long-press on phones) a message to react,
👋 nudge button shakes everyone's screen, emoji-only messages show up big, typing indicators,
and slash commands: `/confetti`, `/shrug`, `/tableflip`, `/unflip`, `/lenny`.

Messages live in memory only (last 200) and are gone when the server stops.

If a friend can't connect, allow Node through your firewall (macOS/Windows will usually prompt the first time).
