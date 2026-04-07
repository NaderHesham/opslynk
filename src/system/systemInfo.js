// system/systemInfo.js
// Collects OS, hardware, CPU, RAM, disk and network info

const os              = require('os');
const { execFileSync } = require('child_process');

function getLanInterfaces() {
  const ifaces = os.networkInterfaces();
  const results = [];
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface || []) {
      if (!addr || addr.internal || addr.family !== 'IPv4') continue;
      results.push({
        address: addr.address || null,
        netmask: addr.netmask || null,
        mac: addr.mac || null
      });
    }
  }
  return results;
}

function getPrimaryNetworkInfo() {
  const ifaces = getLanInterfaces();
  for (const addr of ifaces) {
    if (addr && addr.address) {
      return { ip: addr.address || null, mac: addr.mac || null };
    }
  }
  return { ip: null, mac: null };
}

function getDiskInfo() {
  try {
    const raw = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\") | Select-Object Size,FreeSpace | ConvertTo-Json -Compress"
    ], { encoding: 'utf8', windowsHide: true }).trim();
    if (!raw) return null;
    const data  = JSON.parse(raw);
    const sizeGb = Number(data.Size      || 0) / (1024 ** 3);
    const freeGb = Number(data.FreeSpace || 0) / (1024 ** 3);
    return {
      drive  : 'C:',
      totalGb: Number.isFinite(sizeGb) ? sizeGb.toFixed(1) : null,
      freeGb : Number.isFinite(freeGb) ? freeGb.toFixed(1) : null
    };
  } catch {
    return null;
  }
}

function getHardwareInfo() {
  try {
    const raw = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "$cs=Get-CimInstance Win32_ComputerSystem; $bios=Get-CimInstance Win32_BIOS; [pscustomobject]@{ Manufacturer=$cs.Manufacturer; Model=$cs.Model; SerialNumber=$bios.SerialNumber } | ConvertTo-Json -Compress"
    ], { encoding: 'utf8', windowsHide: true }).trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getSystemInfo() {
  const net  = getPrimaryNetworkInfo();
  const cpus = os.cpus() || [];
  const hw   = getHardwareInfo();
  return {
    hostname    : os.hostname(),
    os          : `${os.type()} ${os.release()}`,
    version     : typeof os.version === 'function' ? os.version() : null,
    arch        : os.arch(),
    manufacturer: hw.Manufacturer  || null,
    modelName   : hw.Model         || null,
    serialNumber: hw.SerialNumber  || null,
    cpuModel    : cpus[0]?.model   || null,
    cpuCores    : cpus.length      || null,
    ramGb       : (os.totalmem() / (1024 ** 3)).toFixed(1),
    ip          : net.ip,
    mac         : net.mac,
    disk        : getDiskInfo()
  };
}

// ── LIVE METRICS ─────────────────────────────────────────────────────────────
// Stateful CPU delta-sampler: compares cpu.times between calls.
// First call returns cpuPct=0 (no prior sample); subsequent calls give real %.
let _prevCpuSample = null;

function _getCpuSample() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    for (const t of Object.values(cpu.times)) total += t;
  }
  return { idle: idle / cpus.length, total: total / cpus.length };
}

function getLiveMetrics() {
  const sample = _getCpuSample();
  let cpuPct = 0;
  if (_prevCpuSample) {
    const di = sample.idle  - _prevCpuSample.idle;
    const dt = sample.total - _prevCpuSample.total;
    cpuPct = dt > 0 ? Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100))) : 0;
  }
  _prevCpuSample = sample;

  const freeMem  = os.freemem();
  const totalMem = os.totalmem();
  return {
    cpuPct,
    ramUsedPct: Math.round((1 - freeMem / totalMem) * 100),
    ramFreeGb:  (freeMem / (1024 ** 3)).toFixed(1)
  };
}

module.exports = {
  getLanInterfaces,
  getPrimaryNetworkInfo,
  getDiskInfo,
  getHardwareInfo,
  getSystemInfo,
  getLiveMetrics
};
