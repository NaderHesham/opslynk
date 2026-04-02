const { spawn } = require('child_process');

const electronBinary = require('electron');
const env = { ...process.env };

// Some shells leave Electron in Node mode, which breaks main-process APIs.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
  windowsHide: false,
  env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
