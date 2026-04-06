using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class InputBlocker {
    static IntPtr kbHook = IntPtr.Zero;
    static IntPtr msHook = IntPtr.Zero;
    static bool accessibilityStateSaved = false;
    static STICKYKEYS originalStickyKeys;
    static FILTERKEYS originalFilterKeys;
    static TOGGLEKEYS originalToggleKeys;

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
    static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref STICKYKEYS pvParam, uint fWinIni);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref FILTERKEYS pvParam, uint fWinIni);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref TOGGLEKEYS pvParam, uint fWinIni);

    [DllImport("user32.dll", SetLastError = true)]
    static extern int ShowCursor(bool bShow);

    [DllImport("user32.dll")]
    static extern bool BlockInput(bool fBlockIt);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    const int WH_KEYBOARD_LL = 13;
    const int WH_MOUSE_LL    = 14;
    const uint SPI_GETFILTERKEYS = 0x0032;
    const uint SPI_SETFILTERKEYS = 0x0033;
    const uint SPI_GETTOGGLEKEYS = 0x0034;
    const uint SPI_SETTOGGLEKEYS = 0x0035;
    const uint SPI_GETSTICKYKEYS = 0x003A;
    const uint SPI_SETSTICKYKEYS = 0x003B;
    const uint SPIF_UPDATEINIFILE = 0x0001;
    const uint SPIF_SENDCHANGE = 0x0002;
    const uint SKF_HOTKEYACTIVE = 0x00000004;
    const uint SKF_CONFIRMHOTKEY = 0x00000008;
    const uint FKF_HOTKEYACTIVE = 0x00000004;
    const uint FKF_CONFIRMHOTKEY = 0x00000008;
    const uint TKF_HOTKEYACTIVE = 0x00000004;
    const uint TKF_CONFIRMHOTKEY = 0x00000008;

    [StructLayout(LayoutKind.Sequential)]
    struct STICKYKEYS {
        public uint cbSize;
        public uint dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct FILTERKEYS {
        public uint cbSize;
        public uint dwFlags;
        public uint iWaitMSec;
        public uint iDelayMSec;
        public uint iRepeatMSec;
        public uint iBounceMSec;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct TOGGLEKEYS {
        public uint cbSize;
        public uint dwFlags;
    }

    static IntPtr KbCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) return (IntPtr)1; // block
        return CallNextHookEx(kbHook, nCode, wParam, lParam);
    }

    static IntPtr MsCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) return (IntPtr)1; // block
        return CallNextHookEx(msHook, nCode, wParam, lParam);
    }

    static void SaveAccessibilityState() {
        originalStickyKeys = new STICKYKEYS { cbSize = (uint)Marshal.SizeOf<STICKYKEYS>() };
        originalFilterKeys = new FILTERKEYS { cbSize = (uint)Marshal.SizeOf<FILTERKEYS>() };
        originalToggleKeys = new TOGGLEKEYS { cbSize = (uint)Marshal.SizeOf<TOGGLEKEYS>() };

        if (!SystemParametersInfo(SPI_GETSTICKYKEYS, originalStickyKeys.cbSize, ref originalStickyKeys, 0)) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to read Sticky Keys state.");
        }
        if (!SystemParametersInfo(SPI_GETFILTERKEYS, originalFilterKeys.cbSize, ref originalFilterKeys, 0)) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to read Filter Keys state.");
        }
        if (!SystemParametersInfo(SPI_GETTOGGLEKEYS, originalToggleKeys.cbSize, ref originalToggleKeys, 0)) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to read Toggle Keys state.");
        }

        accessibilityStateSaved = true;
    }

    static void DisableAccessibilityHotkeys() {
        if (!accessibilityStateSaved) SaveAccessibilityState();

        var sticky = originalStickyKeys;
        sticky.dwFlags &= ~(SKF_HOTKEYACTIVE | SKF_CONFIRMHOTKEY);
        if (!SystemParametersInfo(SPI_SETSTICKYKEYS, sticky.cbSize, ref sticky, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to disable Sticky Keys hotkeys.");
        }

        var filter = originalFilterKeys;
        filter.dwFlags &= ~(FKF_HOTKEYACTIVE | FKF_CONFIRMHOTKEY);
        if (!SystemParametersInfo(SPI_SETFILTERKEYS, filter.cbSize, ref filter, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to disable Filter Keys hotkeys.");
        }

        var toggle = originalToggleKeys;
        toggle.dwFlags &= ~(TKF_HOTKEYACTIVE | TKF_CONFIRMHOTKEY);
        if (!SystemParametersInfo(SPI_SETTOGGLEKEYS, toggle.cbSize, ref toggle, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to disable Toggle Keys hotkeys.");
        }
    }

    static void RestoreAccessibilityHotkeys() {
        if (!accessibilityStateSaved) return;
        SystemParametersInfo(SPI_SETSTICKYKEYS, originalStickyKeys.cbSize, ref originalStickyKeys, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
        SystemParametersInfo(SPI_SETFILTERKEYS, originalFilterKeys.cbSize, ref originalFilterKeys, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
        SystemParametersInfo(SPI_SETTOGGLEKEYS, originalToggleKeys.cbSize, ref originalToggleKeys, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
    }

    static void HideCursor() {
        while (ShowCursor(false) >= 0) { }
    }

    static void ShowCursorAgain() {
        while (ShowCursor(true) < 0) { }
    }

    [STAThread]
    static void Main(string[] args) {
        if (args.Length == 0) return;

        if (args[0] == "block") {
            try {
                DisableAccessibilityHotkeys();
                HideCursor();

                // BlockInput is the most reliable Win32 method — blocks all input
                // including Win key. Requires sufficient privilege; hooks are the fallback.
                BlockInput(true);

                IntPtr mod = GetModuleHandle(null);
                kbHook = SetWindowsHookEx(WH_KEYBOARD_LL, kbProc, mod, 0);
                msHook = SetWindowsHookEx(WH_MOUSE_LL,    msProc, mod, 0);

                if (kbHook == IntPtr.Zero || msHook == IntPtr.Zero) {
                    Console.Error.WriteLine("[InputBlocker] Failed to install hooks");
                    return;
                }

                // Message loop required for low-level hooks to fire
                Application.Run();
            } catch (Exception ex) {
                Console.Error.WriteLine("[InputBlocker] " + ex.Message);
            } finally {
                BlockInput(false);
                if (kbHook != IntPtr.Zero) UnhookWindowsHookEx(kbHook);
                if (msHook != IntPtr.Zero) UnhookWindowsHookEx(msHook);
                RestoreAccessibilityHotkeys();
                ShowCursorAgain();
            }
        }
    }
}
