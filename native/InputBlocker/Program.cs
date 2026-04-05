using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class InputBlocker {
    static IntPtr kbHook = IntPtr.Zero;
    static IntPtr msHook = IntPtr.Zero;

    delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    // Keep delegates alive to prevent GC collection
    static readonly HookProc kbProc = KbCallback;
    static readonly HookProc msProc = MsCallback;

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    static extern IntPtr GetModuleHandle(string? lpModuleName);

    const int WH_KEYBOARD_LL = 13;
    const int WH_MOUSE_LL    = 14;

    static IntPtr KbCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) return (IntPtr)1; // block
        return CallNextHookEx(kbHook, nCode, wParam, lParam);
    }

    static IntPtr MsCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) return (IntPtr)1; // block
        return CallNextHookEx(msHook, nCode, wParam, lParam);
    }

    [STAThread]
    static void Main(string[] args) {
        if (args.Length == 0) return;

        if (args[0] == "block") {
            IntPtr mod = GetModuleHandle(null);
            kbHook = SetWindowsHookEx(WH_KEYBOARD_LL, kbProc, mod, 0);
            msHook = SetWindowsHookEx(WH_MOUSE_LL,    msProc, mod, 0);

            if (kbHook == IntPtr.Zero || msHook == IntPtr.Zero) {
                Console.Error.WriteLine("[InputBlocker] Failed to install hooks");
                return;
            }

            // Message loop required for low-level hooks to fire
            Application.Run();

            // Cleanup on exit
            if (kbHook != IntPtr.Zero) UnhookWindowsHookEx(kbHook);
            if (msHook != IntPtr.Zero) UnhookWindowsHookEx(msHook);
        }
    }
}
