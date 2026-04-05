'use strict';

const { spawn }    = require('child_process');
const path         = require('path');
const { app }      = require('electron');

function getBlockerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'InputBlocker.exe');
  }
  return path.join(__dirname, '../../resources/InputBlocker.exe');
}

let blockerProcess = null;
let isBlocking     = false;

function blockInput() {
  if (isBlocking || blockerProcess) return;

  const exePath = getBlockerPath();

  blockerProcess = spawn(exePath, ['block'], {
    stdio:       ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
    detached:    false
  });

  blockerProcess.stderr.on('data', (data) => {
    console.error('[InputBlocker]', data.toString().trim());
  });

  blockerProcess.on('error', (err) => {
    console.error('[InputBlocker] failed to start:', err.message);
    blockerProcess = null;
    isBlocking     = false;
  });

  blockerProcess.on('exit', () => {
    blockerProcess = null;
    isBlocking     = false;
  });

  isBlocking = true;
}

function unblockInput() {
  if (!blockerProcess) return;
  try {
    blockerProcess.kill('SIGTERM');
  } catch (_) {}
  blockerProcess = null;
  isBlocking     = false;
}

function isInputBlocked() {
  return isBlocking;
}

module.exports = { blockInput, unblockInput, isInputBlocked };
