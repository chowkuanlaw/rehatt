'use strict';
/*
 * "Stay quiet in meetings and presentations" for Lapis inside Rehatt (Windows only), with the same two
 * questions Lapis asks: is an app full screen or presenting (SHQueryUserNotificationState), and is
 * Do not disturb on (ToastNotificationManager.NotificationMode). One read-only PowerShell call, made
 * only when something is about to show. No microphone or camera. Anything that fails means "not quiet".
 */
const path = require('path');
const { execFile } = require('child_process');

const PS = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SCRIPT = "$s=-1;try{Add-Type -Namespace RehattQuiet -Name N -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int s);';$x=0;if([RehattQuiet.N]::SHQueryUserNotificationState([ref]$x) -eq 0){$s=$x}}catch{};" +
  "$m=-1;try{$null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime];$m=[int][Windows.UI.Notifications.ToastNotificationManager]::GetDefault().NotificationMode}catch{};\"$s $m\"";
const BUSY_STATES = [2, 3, 4, 7]; // busy, full screen, presenting, app
const QUIET_MODES = [1, 2];       // priority only, alarms only

function check() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve({ state: null, mode: null });
    try {
      execFile(PS, ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { windowsHide: true, timeout: 10000 }, (err, out) => {
        if (err) return resolve({ state: null, mode: null });
        const [s, m] = String(out || '').trim().split(/\s+/).map(Number);
        resolve({ state: Number.isFinite(s) ? s : null, mode: Number.isFinite(m) ? m : null });
      });
    } catch (e) { resolve({ state: null, mode: null }); }
  });
}
async function isQuiet() { const r = await check(); return BUSY_STATES.includes(r.state) || QUIET_MODES.includes(r.mode); }
module.exports = { check, isQuiet, BUSY_STATES, QUIET_MODES };
