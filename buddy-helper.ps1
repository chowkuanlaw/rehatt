# Kopi the buddy's eyes (buddy-main.cjs). Runs in the background while Kopi Island runs and answers one line
# at a time, in a few milliseconds, so Kopi can follow the window under the mouse while you drag him.
#   <id> at <x> <y>                 -> the window under that point (physical pixels): title, process, visible rect
#   <id> shot <x> <y> <w> <h> <file> -> saves that part of the screen as a PNG (only that part: light and fast)
# Every answer starts with the same <id>, so answers never get mixed up.
# Kopi Island's own windows (the island, Kopi's layer) are skipped: param -Skip is Kopi Island's process id.
param([int]$Skip = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -ReferencedAssemblies System.Drawing @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Drawing; using System.Drawing.Imaging;
public static class KopiEyes {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out R r, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  public static void Init() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { SetProcessDPIAware(); } }
  static R Visible(IntPtr h) { R r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r); return r; } // without the invisible borders
  // The top-most real window under the point (in z-order), skipping Kopi Island, hidden and see-through windows.
  public static string At(int x, int y, uint skip) {
    string found = null;
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      int ex = GetWindowLong(h, -20); if ((ex & 0x20) != 0) return true;              // WS_EX_TRANSPARENT: click-through overlays
      uint pid; GetWindowThreadProcessId(h, out pid); if (pid == skip) return true;
      R r = Visible(h); if (r.Rt - r.L < 40 || r.B - r.T < 40) return true;
      if (x < r.L || x >= r.Rt || y < r.T || y >= r.B) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      string name = ""; try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
      found = "{\"title\":" + Json(sb.ToString()) + ",\"process\":" + Json(name) + ",\"x\":" + r.L + ",\"y\":" + r.T + ",\"w\":" + (r.Rt - r.L) + ",\"h\":" + (r.B - r.T) + "}";
      return false;
    }, IntPtr.Zero);
    return found ?? "{}";
  }
  public static string Shot(int x, int y, int w, int h, string file) {
    using (var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
      using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(x, y, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
      bmp.Save(file, ImageFormat.Png);
    }
    return "{\"ok\":true}";
  }
  static string Json(string s) {
    var b = new StringBuilder("\"");
    foreach (char c in s) { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < ' ') b.Append(' '); else b.Append(c); }
    return b.Append('"').ToString();
  }
}
"@
[KopiEyes]::Init()
[Console]::Out.WriteLine('{"ready":true}'); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $p = $line.Split(' ', 7); $id = $p[0]; $p = $p[1..($p.Count - 1)]
  try {
    switch ($p[0]) {
      'at'   { $out = [KopiEyes]::At([int]$p[1], [int]$p[2], [uint32]$Skip) }
      'shot' { $out = [KopiEyes]::Shot([int]$p[1], [int]$p[2], [int]$p[3], [int]$p[4], $p[5]) }
      default { $out = '{"error":"unknown"}' }
    }
  } catch { $out = '{"error":"' + ($_.Exception.Message -replace '[\\"]', ' ') + '"}' }
  [Console]::Out.WriteLine($id + ' ' + $out); [Console]::Out.Flush()
}
