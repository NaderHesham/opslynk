import { execFile, spawn } from 'child_process';

interface DeviceActionResult {
  success: boolean;
  message: string;
}

function runExecFile(command: string, args: string[], timeoutMs = 30000): Promise<DeviceActionResult> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          message: String(stderr || error.message || 'Command execution failed.').trim()
        });
        return;
      }
      resolve({
        success: true,
        message: String(stdout || stderr || 'Command executed.').trim() || 'Command executed.'
      });
    });
  });
}

function runDetached(command: string, args: string[]): DeviceActionResult {
  try {
    const child = spawn(command, args, { windowsHide: true, detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true, message: 'Command accepted.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to start command.' };
  }
}

export async function executeDeviceAction(action: string, script?: string): Promise<DeviceActionResult> {
  if (action === 'restart_device') {
    return runDetached('shutdown', ['/r', '/t', '5', '/f']);
  }
  if (action === 'shutdown_device') {
    return runDetached('shutdown', ['/s', '/t', '5', '/f']);
  }
  if (action === 'signout_device') {
    return runDetached('shutdown', ['/l']);
  }
  if (action === 'flush_dns') {
    const result = await runExecFile('ipconfig', ['/flushdns'], 20000);
    return { success: result.success, message: result.success ? 'DNS cache flushed.' : result.message };
  }
  if (action === 'clean_temp') {
    const cleanTempScript = "$p=$env:TEMP; if(Test-Path $p){Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue}; Write-Output 'Temp cleaned'";
    const result = await runExecFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cleanTempScript], 45000);
    return { success: result.success, message: result.success ? 'Temp files cleaned.' : result.message };
  }
  if (action === 'run_script') {
    const scriptText = String(script || '').trim();
    if (!scriptText) return { success: false, message: 'Script content is empty.' };
    const result = await runExecFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', scriptText], 45000);
    const output = String(result.message || '').slice(0, 1200);
    return { success: result.success, message: output || (result.success ? 'Script executed.' : 'Script failed.') };
  }
  return { success: false, message: 'Unsupported device action.' };
}
