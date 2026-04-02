// system/systemInfo.js
// Collects OS, hardware, CPU, RAM, disk and network info

const os              = require('os');
const { execFileSync } = require('child_process');

function getPrimaryNetworkInfo() {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface || []) {
      if (addr && addr.family === 'IPv4' && !addr.internal) {
        return { ip: addr.address || null, mac: addr.mac || null };
      }
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

module.exports = {
  getPrimaryNetworkInfo,
  getDiskInfo,
  getHardwareInfo,
  getSystemInfo
};
