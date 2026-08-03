import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ActionChord } from "@csd/shared";

const execFileAsync = promisify(execFile);

/** Map nut-style key names to WinForms SendKeys tokens */
const SENDKEYS_MAP: Record<string, string> = {
  LeftControl: "^",
  RightControl: "^",
  Control: "^",
  LeftAlt: "%",
  RightAlt: "%",
  Alt: "%",
  LeftShift: "+",
  RightShift: "+",
  Shift: "+",
  Enter: "{ENTER}",
  Return: "{ENTER}",
  Backspace: "{BACKSPACE}",
  Delete: "{DELETE}",
  Tab: "{TAB}",
  Escape: "{ESC}",
  Space: " ",
  NumPad1: "1",
  NumPad2: "2",
  NumPad3: "3",
  NumPad4: "4",
  NumPad5: "5",
  NumPad6: "6",
  NumPad7: "7",
  NumPad8: "8",
  NumPad9: "9",
  NumPad0: "0",
};

function toSendKeys(chord: ActionChord): string {
  const modifiers: string[] = [];
  const mains: string[] = [];

  for (const key of chord.keys) {
    const mapped = SENDKEYS_MAP[key] ?? key;
    if (mapped === "^" || mapped === "%" || mapped === "+") {
      modifiers.push(mapped);
    } else if (mapped.length === 1) {
      mains.push(mapped.toLowerCase());
    } else if (mapped.startsWith("{")) {
      mains.push(mapped);
    } else {
      mains.push(mapped.length === 1 ? mapped.toLowerCase() : `{${mapped.toUpperCase()}}`);
    }
  }

  const mod = modifiers.join("");
  if (mains.length === 0) return "";
  if (mains.length === 1) return `${mod}${mains[0]}`;
  return `${mod}(${mains.join("")})`;
}

function escapePsString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function findCursorWindow(titleMatch: string): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  const script = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CsdWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static bool Found = false;
  public static string Needle = "";
  public static bool Check(IntPtr hWnd, IntPtr lParam) {
    if (!IsWindowVisible(hWnd)) return true;
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, 512);
    if (sb.ToString().IndexOf(Needle, StringComparison.OrdinalIgnoreCase) >= 0) { Found = true; return false; }
    return true;
  }
}
"@
[CsdWin]::Needle = '${escapePsString(titleMatch)}'
[CsdWin]::Found = $false
[void][CsdWin]::EnumWindows([CsdWin+EnumProc]{ param($h,$l) [CsdWin]::Check($h,$l) }, [IntPtr]::Zero)
if ([CsdWin]::Found) { Write-Output '1' } else { Write-Output '0' }
`.trim();

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 8000 },
    );
    return stdout.trim() === "1";
  } catch {
    return false;
  }
}

export async function focusCursorWindow(titleMatch: string): Promise<boolean> {
  if (process.platform !== "win32") {
    throw new Error("Window focus is only implemented for Windows in MVP");
  }

  const script = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CsdFocus {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static IntPtr Target = IntPtr.Zero;
  public static string Needle = "";
  public static bool Check(IntPtr hWnd, IntPtr lParam) {
    if (!IsWindowVisible(hWnd)) return true;
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, 512);
    if (sb.ToString().IndexOf(Needle, StringComparison.OrdinalIgnoreCase) >= 0) { Target = hWnd; return false; }
    return true;
  }
}
"@
[CsdFocus]::Needle = '${escapePsString(titleMatch)}'
[CsdFocus]::Target = [IntPtr]::Zero
[void][CsdFocus]::EnumWindows([CsdFocus+EnumProc]{ param($h,$l) [CsdFocus]::Check($h,$l) }, [IntPtr]::Zero)
if ([CsdFocus]::Target -eq [IntPtr]::Zero) { Write-Output '0'; exit 0 }
if ([CsdFocus]::IsIconic([CsdFocus]::Target)) { [void][CsdFocus]::ShowWindow([CsdFocus]::Target, 9) }
[void][CsdFocus]::SetForegroundWindow([CsdFocus]::Target)
Start-Sleep -Milliseconds 120
Write-Output '1'
`.trim();

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 10000 },
  );
  return stdout.trim() === "1";
}

export async function sendChord(chord: ActionChord): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Key injection is only implemented for Windows in MVP");
  }

  const sequence = toSendKeys(chord);
  if (!sequence) return;

  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escapePsString(sequence)}')
`.trim();

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 8000 },
  );
}

export async function focusAndInject(
  titleMatch: string,
  chord: ActionChord,
  delayMs: number,
): Promise<{ focused: boolean }> {
  const focused = await focusCursorWindow(titleMatch);
  if (!focused) {
    throw new Error(`Cursor window matching "${titleMatch}" not found`);
  }
  if (chord.keys.length > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
    await sendChord(chord);
  }
  return { focused };
}
