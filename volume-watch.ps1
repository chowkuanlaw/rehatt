# Prints "<volume 0-100> <muted 0/1>" whenever the Windows master volume changes (Kopi Island volume bar).
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace KopiIsland {
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float level, Guid context);
    int j();
    int GetMasterVolumeLevelScalar(out float level);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid context);
    int GetMute(out bool mute);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref Guid id, int context, int parameters, out IAudioEndpointVolume volume); }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  public static class Audio {
    static IAudioEndpointVolume Endpoint() {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
      IMMDevice device; Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
      IAudioEndpointVolume volume; var id = typeof(IAudioEndpointVolume).GUID;
      Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, 0, out volume));
      return volume;
    }
    public static string Read() {
      var v = Endpoint(); float level; bool mute;
      Marshal.ThrowExceptionForHR(v.GetMasterVolumeLevelScalar(out level));
      Marshal.ThrowExceptionForHR(v.GetMute(out mute));
      return ((int)Math.Round(level * 100)).ToString() + " " + (mute ? "1" : "0");
    }
  }
}
'@
param([int]$Parent = 0)
$last = ''
$tick = 0
while ($true) {
  # Stop together with Kopi Island, also when it was closed abruptly.
  if ($Parent -and (++$tick % 15 -eq 0) -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { exit 0 }
  try { $now = [KopiIsland.Audio]::Read() } catch { $now = $last }
  if ($now -ne $last) { [Console]::Out.WriteLine($now); [Console]::Out.Flush(); $last = $now }
  Start-Sleep -Milliseconds 150
}
