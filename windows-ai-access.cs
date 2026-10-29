using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows;
using System.Windows.Automation;

namespace KopiIsland.Native {
  public class Target {
    public string id, title, process, started;
    public long handle;
    public int pid;
  }
  public class Node {
    public int index, parent;
    public string id, name, type, automationId, className, helpText;
    public bool enabled, password;
  }
  public class Snapshot {
    public bool ok, truncated;
    public string error, provider, contextKey, title;
    public List<Node> nodes = new List<Node>();
  }
  public class Guard { public string id, name; }
  public static class Access {
    delegate bool EnumProc(IntPtr hwnd, IntPtr lparam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lparam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int command);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] input, int size);
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct UNION {
      [FieldOffset(0)] public KEYBDINPUT key;
      [FieldOffset(0)] public MOUSEINPUT mouse;
    }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
    static bool Browser(string name) {
      return Regex.IsMatch(name, "^(chrome|msedge|firefox|brave|opera|vivaldi|arc|zen|waterfox|librewolf)$", RegexOptions.IgnoreCase);
    }
    static bool Supported(string name) { return Browser(name) || Regex.IsMatch(name, "^(chatgpt|claude)$", RegexOptions.IgnoreCase); }
    static string RuntimeId(AutomationElement element) { return String.Join(".", element.GetRuntimeId()); }
    public static List<Target> Windows() {
      var result = new List<Target>();
      EnumWindows(delegate(IntPtr hwnd, IntPtr unused) {
        try {
          if (!IsWindowVisible(hwnd)) return true;
          uint pid; GetWindowThreadProcessId(hwnd, out pid);
          using (var process = Process.GetProcessById((int)pid)) {
            if (!Supported(process.ProcessName)) return true;
            var element = AutomationElement.FromHandle(hwnd);
            string title = element.Current.Name;
            if (String.IsNullOrWhiteSpace(title)) return true;
            string started = process.StartTime.ToUniversalTime().Ticks.ToString();
            result.Add(new Target { handle = hwnd.ToInt64(), pid = (int)pid, title = title,
              process = process.ProcessName, started = started,
              id = pid.ToString() + ":" + hwnd.ToInt64().ToString() + ":" + started });
          }
        } catch { }
        return true;
      }, IntPtr.Zero);
      return result;
    }
    static AutomationElement Root(Target target) {
      var handle = new IntPtr(target.handle);
      if (!IsWindow(handle)) throw new Exception("The connected window was closed.");
      uint pid; GetWindowThreadProcessId(handle, out pid);
      if ((int)pid != target.pid) throw new Exception("The window no longer belongs to the same app.");
      using (var process = Process.GetProcessById(target.pid)) {
        if (process.StartTime.ToUniversalTime().Ticks.ToString() != target.started ||
            !String.Equals(process.ProcessName, target.process, StringComparison.OrdinalIgnoreCase))
          throw new Exception("The app restarted. Connect the window again.");
      }
      return AutomationElement.FromHandle(handle);
    }
    static string Value(AutomationElement element) {
      if (element.Current.IsPassword) throw new Exception("Password fields are not read.");
      object pattern;
      if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) return ((ValuePattern)pattern).Current.Value;
      if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) return ((TextPattern)pattern).DocumentRange.GetText(10000);
      throw new Exception("The input field cannot be read safely.");
    }
    static string BrowserUrl(AutomationElement root) {
      var edits = root.FindAll(TreeScope.Descendants,
        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
      foreach (AutomationElement edit in edits) {
        try {
          string label = edit.Current.Name;
          if (!Regex.IsMatch(label, "address|alamat|location|lokasi|search or enter|cari.*alamat", RegexOptions.IgnoreCase)) continue;
          string raw = Value(edit).Trim();
          if (!raw.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) raw = "https://" + raw;
          Uri url;
          if (Uri.TryCreate(raw, UriKind.Absolute, out url) && url.Scheme == "https" &&
              (url.Host == "chatgpt.com" || url.Host == "claude.ai"))
            return url.GetLeftPart(UriPartial.Path).TrimEnd('/');
        } catch { }
      }
      return null;
    }
    static string Identity(Target target, AutomationElement root, out string provider) {
      if (Browser(target.process)) {
        string url = BrowserUrl(root);
        if (url == null) throw new Exception("The active tab shows no recognisable ChatGPT or Claude chat. Keep the chat in its own window.");
        provider = new Uri(url).Host == "chatgpt.com" ? "chatgpt" : "claude";
        return target.id + ":" + url;
      }
      provider = target.process.ToLowerInvariant();
      return target.id + ":native:" + root.Current.Name;
    }
    static AutomationElement Content(Target target, AutomationElement root) {
      var document = root.FindFirst(TreeScope.Descendants,
        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
      if (document != null) return document;
      if (Browser(target.process)) throw new Exception("The browser does not make this chat readable for Windows.");
      return root;
    }
    static void Walk(AutomationElement element, int parent, List<Node> nodes,
                     Dictionary<string, AutomationElement> elements, Stopwatch timer, ref bool truncated, int depth, CacheRequest cache) {
      if (element == null) return;
      if (nodes.Count >= 1800 || timer.ElapsedMilliseconds > 6000 || depth > 40) { truncated = true; return; }
      try {
        var current = element.Cached;
        string id = RuntimeId(element);
        int index = nodes.Count;
        nodes.Add(new Node { index = index, parent = parent, id = id,
          name = current.IsPassword ? "" : (current.Name ?? ""),
          type = current.ControlType.ProgrammaticName.Replace("ControlType.", ""),
          automationId = current.AutomationId ?? "", className = current.ClassName ?? "",
          helpText = current.IsPassword ? "" : (current.HelpText ?? ""),
          enabled = current.IsEnabled, password = current.IsPassword });
        if (elements != null) elements[id] = element;
        if (current.IsPassword) return;
        var walker = TreeWalker.RawViewWalker;
        var child = walker.GetFirstChild(element, cache);
        while (child != null && !truncated) {
          Walk(child, index, nodes, elements, timer, ref truncated, depth + 1, cache);
          child = walker.GetNextSibling(child, cache);
        }
      } catch { truncated = true; }
    }
    static Snapshot Read(Target target, Dictionary<string, AutomationElement> elements) {
      var result = new Snapshot();
      try {
        var root = Root(target); string provider;
        result.contextKey = Identity(target, root, out provider); result.provider = provider;
        try { result.title = root.Current.Name; } catch { }
        bool truncated = false;
        var cache = new CacheRequest(); cache.TreeScope = TreeScope.Element; cache.TreeFilter = Automation.RawViewCondition;
        cache.AutomationElementMode = AutomationElementMode.Full;
        cache.Add(AutomationElement.NameProperty); cache.Add(AutomationElement.ControlTypeProperty);
        cache.Add(AutomationElement.AutomationIdProperty); cache.Add(AutomationElement.ClassNameProperty);
        cache.Add(AutomationElement.HelpTextProperty); cache.Add(AutomationElement.IsPasswordProperty);
        cache.Add(AutomationElement.IsEnabledProperty);
        Walk(Content(target, root).GetUpdatedCache(cache), -1, result.nodes, elements, Stopwatch.StartNew(), ref truncated, 0, cache);
        result.truncated = truncated; result.ok = true;
      } catch (Exception error) { result.error = error.Message; }
      return result;
    }
    public static Snapshot Read(Target target) { return Read(target, null); }
    public static void Open(Target target) {
      Root(target); var handle = new IntPtr(target.handle);
      ShowWindowAsync(handle, 9); SetForegroundWindow(handle);
    }
    static void GuardContext(Target target, string expected) {
      string provider;
      if (Identity(target, Root(target), out provider) != expected)
        throw new Exception("The chat changed. The answer was not sent.");
    }
    static void CheckGuards(Dictionary<string, AutomationElement> elements, Guard[] guards) {
      if (guards == null || guards.Length == 0) throw new Exception("The question can no longer be recognised.");
      foreach (var guard in guards) {
        AutomationElement element;
        if (!elements.TryGetValue(guard.id, out element) || element.Current.Name != guard.name)
          throw new Exception("The question changed in the meantime. Look at the chat again.");
      }
    }
    static void CheckTimeline(Snapshot snapshot, string composerId, Guard[] timeline) {
      int editor = -1;
      foreach (var node in snapshot.nodes) if (node.id == composerId) editor = node.index;
      if (editor < 0 || timeline == null) throw new Exception("The chat cannot be checked.");
      var actual = new List<Node>();
      foreach (var node in snapshot.nodes) if (node.type == "Text" && node.index < editor) actual.Add(node);
      if (actual.Count != timeline.Length) throw new Exception("There is a new message or a different question. Check the chat.");
      for (int i = 0; i < actual.Count; i++)
        if (actual[i].id != timeline[i].id || actual[i].name != timeline[i].name)
          throw new Exception("The chat changed in the meantime. Check the chat.");
    }
    static bool SameFocus(Target target, AutomationElement composer) {
      try { return GetForegroundWindow() == new IntPtr(target.handle) &&
        RuntimeId(AutomationElement.FocusedElement) == RuntimeId(composer); } catch { return false; }
    }
    public static void Reply(Target target, string expectedContext, string composerId, Guard[] guards, Guard[] timeline, string text) {
      if (String.IsNullOrWhiteSpace(text) || text.Length > 5000) throw new Exception("Use an answer of 1 to 5000 characters.");
      var elements = new Dictionary<string, AutomationElement>();
      var snapshot = Read(target, elements);
      if (!snapshot.ok || snapshot.truncated || snapshot.contextKey != expectedContext)
        throw new Exception("The chat cannot be checked safely. Open the chat again.");
      CheckGuards(elements, guards);
      CheckTimeline(snapshot, composerId, timeline);
      foreach (var node in snapshot.nodes)
        if (node.type == "Button" && node.enabled && Regex.IsMatch(node.name.Trim(),
          "^(stop( generating| response| streaming| answering)?|henti(kan)?( menjana)?)$", RegexOptions.IgnoreCase))
          throw new Exception("The AI is busy again. The answer was not sent.");
      AutomationElement composer;
      if (!elements.TryGetValue(composerId, out composer) || composer.Current.IsPassword || !composer.Current.IsEnabled)
        throw new Exception("The right input field is no longer available.");
      if (!String.IsNullOrWhiteSpace(Value(composer)))
        throw new Exception("There is already text in the chat. It is not overwritten.");
      GuardContext(target, expectedContext);
      object pattern;
      if (composer.TryGetCurrentPattern(ValuePattern.Pattern, out pattern) && !((ValuePattern)pattern).Current.IsReadOnly) {
        ((ValuePattern)pattern).SetValue(text);
      } else {
        // Unicode input only after an explicit Send click, into the exact verified editor.
        Open(target); composer.SetFocus(); Thread.Sleep(160);
        for (int offset = 0; offset < text.Length; offset += 256) {
          if (!SameFocus(target, composer)) throw new Exception("The focus changed. Check the input field; the answer was not sent.");
          GuardContext(target, expectedContext);
          int count = Math.Min(256, text.Length - offset);
          var input = new INPUT[count * 2];
          for (int i = 0; i < count; i++) {
            input[i * 2].type = 1; input[i * 2].data.key.scan = text[offset + i]; input[i * 2].data.key.flags = 4;
            input[i * 2 + 1] = input[i * 2]; input[i * 2 + 1].data.key.flags = 6;
          }
          if (SendInput((uint)input.Length, input, Marshal.SizeOf(typeof(INPUT))) != input.Length)
            throw new Exception("Windows interrupted the text input. Check the chat.");
        }
      }
      Thread.Sleep(350);
      GuardContext(target, expectedContext);
      if (Value(composer).Replace("\r\n", "\n").Trim() != text.Replace("\r\n", "\n").Trim()) throw new Exception("The typed text was not confirmed. Check the chat.");
      elements.Clear(); snapshot = Read(target, elements);
      if (!snapshot.ok || snapshot.truncated || snapshot.contextKey != expectedContext) throw new Exception("The chat is no longer readable. Check the answer you typed.");
      CheckGuards(elements, guards);
      CheckTimeline(snapshot, composerId, timeline);
      AutomationElement send = null;
      foreach (var node in snapshot.nodes) {
        if (node.type == "Button" && node.enabled && Regex.IsMatch(node.name.Trim(),
          "^(send( message)?|send now|hantar( mesej)?)$", RegexOptions.IgnoreCase)) {
          if (send != null) throw new Exception("Several send buttons found. Send the answer in the app.");
          send = elements[node.id];
        }
      }
      if (send == null || !send.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
        throw new Exception("The answer is in the chat, but sending is not supported. Click Send there.");
      GuardContext(target, expectedContext);
      ((InvokePattern)pattern).Invoke();
      // The caller confirms a new streaming turn; Invoke alone is not a delivery receipt.
    }
  }
}
