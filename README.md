# Kopi Island

**A Dynamic Island for Windows, with Kopi the kopi-O cup living inside it.**
Kopi shows what Claude Code and Codex are doing, asks before your AI does something important, and tells you when the work is done.

Windows 10 and 11.

## What it does

- **Claude Code and Codex, live**: which file your AI reads or edits and which command it runs. Kopi's steam and glow change colour for busy, done and error.
- **Allow in one click**: when your AI asks permission (say for `npm install`), allow or deny right in the island.
- **A sign when it's done**: a chime, the done colour, and what changed.
- **Kopi, your buddy**: drag Kopi onto any window and ask what's going on. He uses the AI you connected and can propose a fix, asking before he touches a file.
- **Usage**: a ring shows how much of your Claude limit you've used.
- **Extras**: Spotify controls, a file tray, clipboard history, a quick note and a focus timer.
- **Kopi himself**: moods, festive outfits and colours. Poke him too often and he gets dizzy.

## Getting started

- **Ctrl+Alt+K** opens the island. **Ctrl+Alt+1–6** jumps straight to an app.
- Open the island → **Settings → AI** and switch on **Claude Code** and/or **Codex**.
- Right-click **Kopi next to the clock** → **Start with Windows**.

## Privacy

Kopi Island runs on your own PC and needs no account. The status of Claude Code and Codex is read locally and sent nowhere. When you ask Kopi something, it goes to the AI you connected yourself. Services you switch on yourself (Spotify, weather) talk directly to that service.

## For developers

Needs [Node.js](https://nodejs.org) and Windows PowerShell 5.1.

```
npm ci
npm start          # run it
npm test           # run the tests
npm run dist:zip   # portable zip in dist/
npm run dist:store # MSIX for the Microsoft Store (run on Windows)
```

Before a Store build, fill in `identityName` and `publisher` under `build.appx` in `package.json` with the values from Partner Center (Product identity page). Spotify needs your own Client ID in `main.js` (`SPOTIFY_CLIENT_ID`).
