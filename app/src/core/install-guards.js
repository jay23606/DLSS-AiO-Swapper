'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const renodx = require('./renodx-release');
function run(file, args) {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
}
function matchingProcesses(processes, gameDir, exePath) {
  const root = path.resolve(gameDir).toLowerCase() + path.sep;
  return processes.filter(p => {
    if (p.ProcessId === process.pid) return false;
    if (p.ExecutablePath) return path.resolve(p.ExecutablePath).toLowerCase().startsWith(root);
    // Protected processes may omit their path. Fail conservatively for a
    // matching executable/helper name, but not unrelated system processes.
    return [exePath ? path.basename(exePath).toLowerCase() : null, 'dlss5-feed-host64.exe'].includes(String(p.Name).toLowerCase());
  });
}
// Windows keeps a running executable open for writing, so a file that can be
// opened for writing is not the image of a running process. That is the
// question this check exists to answer, and it needs neither PowerShell nor
// WMI - which is what makes it the right fallback when those are slow,
// restricted or missing.
function executableLocked(exePath) {
  let handle;
  try {
    handle = fs.openSync(exePath, 'r+');
    return false;
  } catch (error) {
    // Locked by a running process. Anything else - no such file, no rights to
    // it, a read-only volume - says nothing about the game and must not block
    // an install.
    return error && (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES');
  } finally {
    if (handle !== undefined) { try { fs.closeSync(handle); } catch { /* already gone */ } }
  }
}

async function assertGameClosed(gameDir, exePath, runner = run, locked = executableLocked) {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  let data;
  try {
    const output = await runner(powershell, ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath) | ConvertTo-Json -Compress"]);
    data = JSON.parse(output || '[]');
  } catch {
    // The process list is unavailable: PowerShell restricted by policy, a cold
    // WMI call past its timeout, or a machine where it simply fails. This used
    // to refuse the install outright, which is a diagnostic becoming a wall -
    // people with a closed game could not install at all. Fall back to asking
    // the executable itself.
    if (exePath && locked(exePath)) {
      throw Object.assign(new Error('Close the game first: its executable is in use.'), { code: 'errGameRunning' });
    }
    return;
  }
  const matches = matchingProcesses(Array.isArray(data) ? data : [data], gameDir, exePath);
  if (matches.length) throw Object.assign(new Error(`Close the game and helper first: ${matches.map(p => p.Name).join(', ')}`), { code: 'errGameRunning' });
}
// Two separate questions, because only one of them is a hard requirement.
// The card is: DLSS-NR runs on the RTX 50 path. The driver is not: the model
// file (nvngx_dlssnr.dll) ships with this app rather than being taken from the
// installed driver, so an older driver still runs an OptiScaler install - which
// is what people who rolled back off 616.x to keep RenoDX working are seeing.
const OPTI_DRIVER = 61656;
// The model needs a Blackwell card. That is the GeForce RTX 50 series and
// also the professional RTX PRO Blackwell boards, which nvidia-smi reports
// as "NVIDIA RTX PRO 6000 Blackwell ..." - a newer card than this gate was
// written for, and it was refused for not being called 50-something.
const blackwell = row => /\bRTX\s*50\d{2}\b/i.test(row.name) ||
  (/\bRTX\s*PRO\b/i.test(row.name) && /\bblackwell\b/i.test(row.name));
const driverNumber = row => {
  const [major, minor] = String(row.driver).split('.');
  return Number(major) * 100 + Number(minor);
};
// Measured upstream by the Feeder author across three machines: with the
// RenoDX DLSS 5 consumer (v4.6 and v4.7), every neural evaluate faults inside
// NVIDIA's own NGX runtime on 616.64 and 616.86, while 616.56 completes.
// Reported as DLSS5-Feeder issue #54.
//
// The fault was the consumer's, not the driver's: the 6.x line passes the same
// self-test 300/300 on 617.14, and that is what this app now installs. So the
// question is asked about the build rather than about the driver - on a payload
// carrying one of the 4.x consumers - and everyone on a current driver is left
// alone instead of being warned about something that has been fixed. It never
// stopped an install and still does not.
const NEURAL_FAULT_DRIVER = 61664;
function driverNeuralFault(rows, consumer = renodx.CONSUMER.sha256) {
  if (!renodx.faults(consumer)) return false;
  return (rows || []).some(row => /nvidia|rtx|gtx/i.test(row.name) && driverNumber(row) >= NEURAL_FAULT_DRIVER);
}
function driverNames(rows) { return (rows || []).map(row => `${row.name} - ${row.driver}`).join(', '); }
function gpuModelSupported(rows) { return rows.some(blackwell); }
function driverSupported(rows) { return rows.some(row => blackwell(row) && driverNumber(row) >= OPTI_DRIVER); }
function gpuSupported(rows) { return gpuModelSupported(rows) && driverSupported(rows); }
async function gpuInfo(runner = run) {
  try {
    const output = await runner('nvidia-smi.exe', ['--query-gpu=name,driver_version', '--format=csv,noheader']);
    return output.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [name, driver] = line.split(',').map(s => s.trim());
      return { name, driver };
    });
  } catch { return null; }
}
// Every display adapter Windows knows, by PCI vendor id - read from the
// registry with reg.exe, so it needs no PowerShell or WMI and works on any
// vendor's driver (nvidia-smi only exists with NVIDIA's).
const DISPLAY_CLASS = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';
const VENDORS = { '10de': 'nvidia', '1002': 'amd', '8086': 'intel' };
function parseRegValues(text, name) {
  const out = new Map();
  let key = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^HKEY_/i.test(line.trim())) { key = line.trim().toLowerCase(); continue; }
    const m = line.match(new RegExp(`^\\s+${name}\\s+REG_SZ\\s+(.*)$`, 'i'));
    if (m && key) out.set(key, m[1].trim());
  }
  return out;
}
async function displayAdapters(runner = run) {
  try {
    const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
    const ids = parseRegValues(await runner(reg, ['query', DISPLAY_CLASS, '/s', '/v', 'MatchingDeviceId']), 'MatchingDeviceId');
    const names = parseRegValues(await runner(reg, ['query', DISPLAY_CLASS, '/s', '/v', 'DriverDesc']), 'DriverDesc');
    const list = [];
    for (const [key, id] of ids) {
      const ven = (String(id).match(/ven_([0-9a-f]{4})/i) || [])[1];
      const vendor = ven && VENDORS[ven.toLowerCase()];
      if (vendor) list.push({ vendor, name: names.get(key) || id });
    }
    return list;
  } catch { return []; }
}
// Which family of routes this PC can use. NVIDIA (nvidia-smi answers) keeps
// every route. Without an NVIDIA card, an AMD Radeon or Intel Arc gets the
// vendor-neutral DLSS 5 port (OptiScaler F5) and the NVIDIA-only routes are
// greyed out. A laptop with Intel graphics beside an NVIDIA GPU stays NVIDIA.
// DLSS_AIO_FORCE_GPU=amd|intel|nvidia overrides the answer (testing on another
// vendor's machine, or a detection that went wrong).
async function gpuMode(runner = run) {
  const forced = String(process.env.DLSS_AIO_FORCE_GPU || '').toLowerCase();
  const nvidia = await gpuInfo(runner);
  const adapters = await displayAdapters(runner);
  let mode;
  if (['amd', 'intel', 'nvidia'].includes(forced)) mode = forced;
  else if ((nvidia && nvidia.length) || adapters.some(a => a.vendor === 'nvidia')) mode = 'nvidia';
  else if (adapters.some(a => a.vendor === 'amd')) mode = 'amd';
  else if (adapters.some(a => a.vendor === 'intel')) mode = 'intel';
  else mode = 'unknown';
  const shown = mode === 'nvidia' && nvidia && nvidia.length
    ? nvidia.map(r => r.name)
    : adapters.filter(a => a.vendor === mode).map(a => a.name);
  return { mode, vendorNeutral: mode === 'amd' || mode === 'intel', forced: Boolean(forced), names: shown.join(', ') || (adapters.map(a => a.name).join(', ')) };
}
function antiCheatPresent(gameDir) {
  const queue = [[gameDir, 0]];
  let examined = 0;
  while (queue.length && examined < 2000) {
    const [dir, depth] = queue.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (examined >= 2000) break;
      examined++;
      if (/easyanticheat|battleye|(?:^|[-_])(?:eac|be)launcher|eaanticheat/i.test(entry.name)) return true;
      if (entry.isDirectory() && depth < 2 && !/^_DLSS5_Backup$|^node_modules$/i.test(entry.name)) queue.push([path.join(dir, entry.name), depth + 1]);
    }
  }
  return false;
}
module.exports = { assertGameClosed, executableLocked, matchingProcesses, gpuInfo, gpuMode, displayAdapters, parseRegValues, gpuSupported, gpuModelSupported, driverSupported, driverNeuralFault, driverNames, antiCheatPresent };
