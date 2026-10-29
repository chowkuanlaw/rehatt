'use strict';
// Extras for the island (main process): file tray, calendar (ICS link), weather (Open-Meteo),
// volume changes and Bluetooth battery levels. Only the Rehatt window may use these channels.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function setup(electron) {
  const { app, ipcMain, shell, nativeImage, BrowserWindow } = electron;
  const file = name => path.join(app.getPath('userData'), name);
  const readJson = (name, fallback) => { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; } };
  const writeJson = (name, value) => { try { fs.writeFileSync(file(name), JSON.stringify(value)); } catch {} };
  const trusted = event => {
    try { return path.resolve(fileURLToPath(event.sender.getURL())).toLowerCase() === path.join(__dirname, 'mascot.html').toLowerCase(); }
    catch { return false; }
  };
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    if (!trusted(event)) return { ok: false, error: 'No access.' };
    try { return { ok: true, ...(await fn(payload, event)) }; } catch (error) { return { ok: false, error: error.message }; }
  });
  const send = (channel, data) => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed() && trusted({ sender: win.webContents })) win.webContents.send(channel, data); };

  // ---------- file tray: remembers paths of files you drop on the island ----------
  let tray = readJson('tray.json', []).filter(p => typeof p === 'string' && fs.existsSync(p));
  const icons = new Map();
  const trayView = async () => ({ files: await Promise.all(tray.map(async p => {
    let icon = icons.get(p);
    if (!icon) { try { icon = await app.getFileIcon(p, { size: 'normal' }); icons.set(p, icon); } catch {} }
    let size = 0; try { size = fs.statSync(p).size; } catch {}
    return { path: p, name: path.basename(p), icon: icon ? icon.toDataURL() : '', size };
  })) });
  handle('extras:tray-get', trayView);
  handle('extras:tray-add', async payload => {
    for (const p of (Array.isArray(payload?.paths) ? payload.paths : []).slice(0, 20)) {
      if (typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p) && !tray.includes(p)) tray.unshift(p);
    }
    tray = tray.slice(0, 24); writeJson('tray.json', tray); return trayView();
  });
  handle('extras:tray-remove', async payload => { tray = tray.filter(p => p !== payload?.path); writeJson('tray.json', tray); return trayView(); });
  handle('extras:tray-open', async payload => {
    if (!tray.includes(payload?.path)) throw new Error('This file is not in the tray.');
    const problem = await shell.openPath(payload.path); if (problem) throw new Error(problem); return {};
  });
  ipcMain.on('extras:tray-drag', (event, p) => {
    if (!trusted(event) || !tray.includes(p) || !fs.existsSync(p)) return;
    event.sender.startDrag({ file: p, icon: icons.get(p) || nativeImage.createFromDataURL(BLANK_PNG) });
  });

  // ---------- settings for calendar and weather ----------
  let config = readJson('extras.json', { calendarUrl: '', city: '' });
  handle('extras:config', async payload => {
    if (payload && typeof payload === 'object') {
      if (typeof payload.calendarUrl === 'string') {
        const url = payload.calendarUrl.trim().replace(/^webcal:/i, 'https:');
        if (url && !/^https:\/\//i.test(url)) throw new Error('Paste an https or webcal link of your calendar.');
        config.calendarUrl = url; calendarCache = null;
      }
      if (typeof payload.city === 'string') { config.city = payload.city.trim().slice(0, 80); weatherCache = null; }
      writeJson('extras.json', config);
    }
    return { config };
  });

  // ---------- calendar: next event from an ICS link (Google: "Secret address in iCal format") ----------
  let calendarCache = null;
  handle('extras:calendar', async () => {
    if (!config.calendarUrl) return { next: null };
    if (!calendarCache || Date.now() - calendarCache.at > 10 * 60000) {
      const res = await fetch(config.calendarUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('Calendar not reachable (' + res.status + ').');
      calendarCache = { at: Date.now(), events: parseIcs(await res.text()) };
    }
    const now = Date.now();
    const next = calendarCache.events.map(e => ({ ...e, start: nextStart(e, now) })).filter(e => e.start && e.start + (e.duration || 0) > now)
      .sort((a, b) => a.start - b.start)[0] || null;
    return { next: next && { title: next.title, start: next.start, allDay: next.allDay } };
  });

  // ---------- weather (Open-Meteo, no account needed) ----------
  let weatherCache = null;
  handle('extras:weather', async () => {
    if (!config.city) return { weather: null };
    if (!weatherCache || Date.now() - weatherCache.at > 15 * 60000) {
      const geo = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + encodeURIComponent(config.city), { signal: AbortSignal.timeout(8000) })).json();
      const place = geo?.results?.[0]; if (!place) throw new Error('City not found.');
      const data = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,is_day`, { signal: AbortSignal.timeout(8000) })).json();
      weatherCache = { at: Date.now(), weather: { place: place.name, temp: Math.round(data.current.temperature_2m), code: data.current.weather_code, day: data.current.is_day === 1 } };
    }
    return { weather: weatherCache.weather };
  });

  // ---------- volume: a small PowerShell helper reports every change of the master volume ----------
  let volumeChild = null;
  function startVolume() {
    if (process.platform !== 'win32' || volumeChild) return;
    volumeChild = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'volume-watch.ps1'), '-Parent', String(process.pid)],
      { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let buffer = '';
    volumeChild.stdout.on('data', chunk => {
      buffer += chunk.toString();
      let end; while ((end = buffer.indexOf('\n')) >= 0) {
        const [level, muted] = buffer.slice(0, end).trim().split(' '); buffer = buffer.slice(end + 1);
        if (level !== undefined && level !== '') send('extras:volume', { level: Number(level), muted: muted === '1' });
      }
    });
    volumeChild.on('exit', () => { volumeChild = null; });
  }

  // ---------- Bluetooth battery levels (headphones, mouse, ...) every 5 minutes ----------
  const BT_SCRIPT = `$k='{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
  $b = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $k -ErrorAction SilentlyContinue).Data
  if ($b -ne $null) { "$b|$($_.FriendlyName)" } }`;
  function readBluetooth() {
    if (process.platform !== 'win32') return;
    const child = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', BT_SCRIPT], { windowsHide: true, shell: false });
    let out = ''; child.stdout.on('data', d => { out += d; });
    child.on('exit', () => {
      const devices = out.split(/\r?\n/).map(line => line.split('|')).filter(([b, n]) => n && /^\d+$/.test(b)).map(([b, n]) => ({ name: n.trim(), battery: Number(b) }));
      send('extras:bluetooth', { devices });
    });
    child.on('error', () => {});
  }

  // ---------- clipboard history: your last 8 copied texts (only in memory, never saved to disk) ----------
  let clips = [], lastClip = '';
  const clipsView = () => ({ clips: clips.map(text => ({ text: text.slice(0, 400), long: text.length > 400 })) });
  async function readClipboard() {
    // readText can give a string or a promise (newer Electron); anything else is ignored.
    let text = ''; try { const r = electron.clipboard.readText(); text = typeof r === 'string' ? r : r && typeof r.then === 'function' ? await r : ''; } catch {}
    if (typeof text !== 'string' || !text || text === lastClip) return; lastClip = text;
    if (!text.trim() || text.length > 20000) return;
    clips = [text, ...clips.filter(c => c !== text)].slice(0, 8);
    send('extras:clips', clipsView());
  }
  handle('extras:clips-get', async () => clipsView());
  handle('extras:clips-copy', async payload => {
    const text = clips[Number(payload?.index)]; if (typeof text !== 'string') throw new Error('Not found.');
    electron.clipboard.writeText(text); lastClip = text; clips = [text, ...clips.filter(c => c !== text)]; return clipsView();
  });
  handle('extras:clips-clear', async () => { clips = []; return clipsView(); });

  // ---------- quick note: one note, saved on your PC ----------
  handle('extras:note-get', async () => ({ text: readJson('note.json', { text: '' }).text || '' }));
  handle('extras:note-set', async payload => { writeJson('note.json', { text: String(payload?.text || '').slice(0, 20000) }); return {}; });

  // ---------- keyboard shortcuts: Ctrl+Alt+1..6 jump straight to a screen ----------
  const SHORTCUTS = { 1: 'home', 2: 'stretch', 3: 'claude', 4: 'meter', 5: 'focus', 6: 'note' };
  app.on('will-quit', () => { try { for (const n of Object.keys(SHORTCUTS)) electron.globalShortcut.unregister('CommandOrControl+Alt+' + n); } catch {} });

  app.whenReady().then(() => {
    const poll = setInterval(() => { readClipboard().catch(() => {}); }, 1000); poll.unref?.();
    for (const [n, view] of Object.entries(SHORTCUTS)) { try { electron.globalShortcut.register('CommandOrControl+Alt+' + n, () => send('extras:shortcut', view)); } catch {} }
    startVolume();
    setTimeout(readBluetooth, 15000); const bt = setInterval(readBluetooth, 5 * 60000); bt.unref?.();
  });
  app.on('before-quit', () => { try { volumeChild?.kill(); } catch {} });
}

// ---------- tiny ICS reader: SUMMARY, DTSTART, DTEND and simple DAILY / WEEKLY repeats ----------
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), events = [];
  let event = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = {};
    else if (line === 'END:VEVENT') { if (event?.start) events.push(event); event = null; }
    else if (event) {
      const colon = line.indexOf(':'); if (colon < 0) continue;
      const head = line.slice(0, colon), value = line.slice(colon + 1), name = head.split(';')[0];
      if (name === 'SUMMARY') event.title = value.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').slice(0, 120);
      if (name === 'DTSTART') { event.start = icsDate(value); event.allDay = /VALUE=DATE(?!-)/.test(head) || /^\d{8}$/.test(value); }
      if (name === 'DTEND') event.end = icsDate(value);
      if (name === 'RRULE') event.rrule = value;
    }
  }
  for (const e of events) e.duration = e.end ? Math.max(0, e.end - e.start) : 0;
  return events.filter(e => e.start).slice(0, 5000);
}
function icsDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(value); if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  return z ? Date.UTC(+y, mo - 1, +d, +h, +mi, +s) : new Date(+y, mo - 1, +d, +h, +mi, +s).getTime();
}
function nextStart(event, now) {
  if (!event.rrule) return event.start;
  const freq = /FREQ=(DAILY|WEEKLY)/.exec(event.rrule)?.[1]; if (!freq) return event.start;
  const until = /UNTIL=(\w+)/.exec(event.rrule)?.[1], end = until ? icsDate(until) : Infinity;
  const step = (freq === 'DAILY' ? 1 : 7) * 86400000 * Number(/INTERVAL=(\d+)/.exec(event.rrule)?.[1] || 1);
  if (event.start + event.duration > now) return event.start;
  const next = event.start + Math.ceil((now - event.duration - event.start) / step) * step;
  return next <= end ? next : null;
}

if (process.versions.electron) setup(require('electron'));
module.exports = { parseIcs, nextStart, icsDate };
