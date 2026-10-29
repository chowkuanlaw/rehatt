# Rehatt

**A Dynamic Island for Windows that tells you when to rehat.**
Kopi, the kopi-O cup, lives in a small island on your screen. He nudges you when Claude Code or Codex has a question or is done, reminds you to stretch and drink water, and shows how much of your Claude limit is left as a glass of teh tarik.

Rehatt brings three apps together: Kopi Island, [Lapis Stretch](https://github.com/chowkuanlaw/lapis-stretch) and [Teh Tarik Meter](https://github.com/chowkuanlaw/teh-tarik-meter). Lapis Stretch and Teh Tarik Meter run inside Rehatt in full, with everything the standalone apps have.

Windows 10 and 11.

## What it does

- **Nudges from your AI.** Claude Code and Codex tell Rehatt when they start, when they have a question, when they are done and when something goes wrong. Kopi's glow changes colour, and a click on the island takes you straight to the right terminal. Rehatt never answers for you, and Claude Code never waits for it.
- **Stretch breaks.** Every 20 minutes or so your kuih pops up in the island with one quick desk stretch: how to do it, a timer, and a tally for the day. Working hours only, quiet during meetings and full-screen apps, and time away from your desk counts as a break.
- **Rest while your AI works.** When Claude Code or Codex starts a job and a stretch is due soon anyway, it comes right then.
- **Water.** Every hour your kuih holds up a glass. Tap to count it.
- **Everything from Lapis Stretch.** Your stretch list, progress by day, week and month, streaks, working hours and lunch, a Friday summary, a "Balik rumah" wrap-up, teh tarik time, a nudge to sleep late at night, 28 kuih to collect, secret codes, and a rare golden kuih. Tap your kuih on the island and it squishes.
- **Your Claude usage as a glass of teh tarik.** Full at the start of your 5-hour window, empty at the limit, with your weekly limit, this week's cups, your pace and extra usage beside it. The numbers come from Claude Code's status line, or from claude.ai if you sign in (or a session key). Kopi warns you at 80% and 95%, and when your pace will run out early. Five drinks to pick from, and a sample to peek at before you sign in. Poke the glass and it talks back.
- **Keep tapping.** Both the kuih and the glass have a surprise for the persistent.
- **Put the island anywhere.** Drag it to any spot on any screen, or keep it fixed at the top like a Dynamic Island. Near an edge it opens inwards.
- **Extras.** A focus timer, a file tray, clipboard history, a quick note and a clock, all as widgets on the island's home.
- **Kopi himself.** Moods, festive outfits, colours, and 28 Malaysian kuih to stretch with.
- **English or Bahasa Melayu.**
- **Updates itself.** The installed version downloads new versions quietly and asks you to restart when one is ready.

## Getting started

Download **Rehatt-Setup** from the [latest release](https://github.com/chowkuanlaw/rehatt/releases/latest) and run it. It installs just for you, no admin needed, and keeps itself up to date. (The zip is a portable copy that tells you when a new version is out but doesn't update itself.)

- **Ctrl+Alt+K** opens the island (Teh Tarik Meter's **Ctrl+Alt+T** works too). **Ctrl+Alt+1–6** jumps to Home, Stretch, Claude, Usage, Focus and Note.
- Right-click **Kopi next to the clock** → **Settings** → **Connections**, and switch on **Claude Code** and/or **Codex**.
- **Settings → Stretch** is Lapis Stretch's own window: today, progress, stretches, your kuih and its settings. **Settings → Usage** is Teh Tarik Meter's.
- Right-click Kopi next to the clock to put the island back at the top, or to keep it fixed there.

If you used Lapis Stretch or Teh Tarik Meter, Rehatt brings your history, kuih and settings along the first time it runs. If you used Kopi Island or Teh Tarik Meter, Rehatt takes over their Claude Code hooks and status line when you connect, so nothing runs twice.

## Privacy

Rehatt runs on your own PC and needs no account. Claude Code and Codex report to Rehatt on your own PC only (127.0.0.1); nothing is sent anywhere. Your stretches, water and usage history are saved in `%APPDATA%\Rehatt`. If you sign in to claude.ai for the usage glass, that happens in a private claude.ai window inside Rehatt: your password goes to Claude only, and Rehatt only reads the same usage numbers as claude.ai's Settings → Usage page. Weather and a calendar link only talk to those services when you switch them on.

## For developers

Needs [Node.js](https://nodejs.org) and Windows PowerShell 5.1.

```
npm ci
npm start          # run it
npm test           # run the tests
npm run dist:installer # Rehatt-Setup.exe in dist/ (updates itself from GitHub releases)
npm run dist:zip   # portable zip in dist/
npm run dist:store # MSIX for the Microsoft Store (run on Windows)
```

Every push builds the installer and the zip on GitHub Actions and runs a smoke test that opens every screen; the screenshots land on the `ci-smoke` branch.

Before a Store build, fill in `identityName` and `publisher` under `build.appx` in `package.json` with the values from Partner Center (Product identity page).

To ship a version: publish a GitHub release tagged `vX.Y.Z`. The build attaches the installer, `latest.yml` and the zip, and installed copies pick it up.

## Credits

Lapis Stretch (`lapis/`) and Teh Tarik Meter (`tehtarik/`) are MIT-licensed; their licences are in those folders. The rest of Rehatt is under the ISC licence in `LICENSE`.
