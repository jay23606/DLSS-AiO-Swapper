'use strict';
// DLSS 5 model per game (DLSS AiO Swapper).
// The NR runtime (nvngx_dlssnr.dll 310.9.x) does NOT read the NVIDIA driver
// profile; it takes the preset the consumer passes. RenoDX DLSS5 passes the
// NRPreset value from its section in ReShade.ini:
//   1 -> model A (CC_Control_..._2026_07_04, September)
//   2 -> model B (hnet-crazy-cuckoo-small-fp8, October, faster)
//   0 -> "not available" in 310.9.16, the DLL falls back to its default B
// Verified with NGX logging in The Witcher 3 (2026-10-19).
const fs = require('fs');
const path = require('path');
const { getIni, setIni } = require('./feeder-config');

const SECTION = 'RenoDX.DLSS5';
const SKIP = /^(_hermes_|_dlss5_backup|reshade-shaders|node_modules|\.git)/i;
const VALUES = new Set([1, 2]);

function findInis(gameDir, maxDepth = 6) {
  const root = path.resolve(String(gameDir || ''));
  if (!root || !fs.existsSync(root)) throw new Error('Game folder not found');
  const found = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const names = entries.map((e) => e.name.toLowerCase());
    const hasConsumer = names.some((n) => /^renodx-dlss5.*\.addon(64|32)?$/.test(n));
    if (names.includes('reshade.ini')) {
      const file = path.join(dir, 'ReShade.ini');
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch {}
      if (hasConsumer || /^\s*\[RenoDX\.DLSS5\]\s*$/im.test(text)) found.push(file);
    } else if (hasConsumer && (names.includes('dxgi.dll') || names.includes('d3d11.dll') || names.includes('d3d12.dll')
      || names.includes('dinput8.dll') || names.includes('version.dll') || names.includes('winmm.dll') || names.includes('d3d9.dll'))) {
      // Fresh install: ReShade writes ReShade.ini on the first game start. The
      // model can already be chosen - set() creates the file with our section,
      // ReShade keeps it and fills in its own defaults.
      found.push(path.join(dir, 'ReShade.ini'));
    }
    if (depth >= maxDepth) return;
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.test(e.name)) walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

function readValue(file) {
  if (!fs.existsSync(file)) return null;
  const raw = getIni(fs.readFileSync(file, 'utf8'), SECTION, 'NRPreset');
  const n = raw === null ? null : parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function get(gameDir) {
  const files = findInis(gameDir);
  if (!files.length) return { ok: true, found: false, files: [] };
  const value = readValue(files[0]);
  return {
    ok: true, found: true,
    files: files.map((f) => path.relative(path.resolve(gameDir), f)),
    value,
    model: value === 1 ? 'A' : 'B'      // 0/unset falls back to B in 310.9.16
  };
}

function set(gameDir, value) {
  const n = Number(value);
  if (!VALUES.has(n)) throw new Error('Model must be A (1) or B (2)');
  const files = findInis(gameDir);
  if (!files.length) return { ok: false, message: 'No RenoDX settings in this game - install DLSS 5 first.' };
  for (const file of files) {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const next = setIni(text, SECTION, 'NRPreset', String(n));
    if (next !== text) {
      try { fs.chmodSync(file, 0o666); } catch {}
      fs.writeFileSync(file, next, 'utf8');
    }
  }
  return get(gameDir);
}

module.exports = { get, set, findInis };
