'use strict';

// RenoDX HDR mods per game - what RHI ("ReShade HDR Installer") is known for.
// RenoDX publishes every mod in its official GitHub "snapshot" release together
// with games-index.json, a catalogue of which mod belongs to which game (Steam
// app id, title, required API, architecture). GitHub records a SHA-256 for each
// release file; every download here is checked against that digest, so a file
// that is not exactly what RenoDX published is refused.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RELEASE_API = 'https://api.github.com/repos/clshortfuse/renodx/releases/tags/snapshot';
const UA = { 'User-Agent': 'DLSS-AiO-Swapper', Accept: 'application/vnd.github+json' };
const TTL = 60 * 60 * 1000;
let memo = null;

const fail = (code, message, params = {}) => Object.assign(new Error(message), { code, params });
// Folder and store names drift from RenoDX's titles: "Kingdom Come- Deliverance
// II" (Xbox folder) vs "Kingdom Come Deliverance 2", "AC Black Flag Resynced"
// vs "Assassin's Creed Black Flag Resynced". Roman numerals become digits and
// the common AC abbreviation is spelled out - on both sides, so a title only
// ever matches the same title.
const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[™®©]/g, '').replace(/[’']/g, '')
  .replace(/^ac\b/, 'assassins creed')
  .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, (r) => ROMAN[r])
  .replace(/\b(the|game of the year|goty|edition|remastered|definitive|complete|enhanced)\b/g, '')
  .replace(/[^a-z0-9]/g, '');

async function fetchJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw fail('hdrErrOffline', `GitHub answered ${res.status}`);
  return res.json();
}
async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA['User-Agent'] }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw fail('hdrErrOffline', `Download answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// The release (file list with digests) and the catalogue, cached for an hour in
// memory and kept on disk so a game page still shows its mod when offline.
async function catalog(cacheDir) {
  if (memo && Date.now() - memo.at < TTL) return memo.data;
  const diskFile = path.join(cacheDir, 'renodx-catalog.json');
  try {
    const release = await fetchJson(RELEASE_API);
    const assets = new Map((release.assets || []).map((a) => [a.name, { url: a.browser_download_url, size: a.size, digest: String(a.digest || '').replace(/^sha256:/, '') }]));
    const idx = assets.get('games-index.json');
    if (!idx || !idx.digest) throw fail('hdrErrCatalog', 'RenoDX catalogue missing from the release');
    const buf = await fetchBytes(idx.url);
    if (sha(buf) !== idx.digest) throw fail('hdrErrDigest', 'games-index.json does not match its published SHA-256');
    const data = { at: release.published_at, games: JSON.parse(buf.toString('utf8')).games || [], assets: Object.fromEntries(assets) };
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(diskFile, JSON.stringify(data));
    memo = { at: Date.now(), data };
    return data;
  } catch (error) {
    try { const data = JSON.parse(fs.readFileSync(diskFile, 'utf8')); memo = { at: Date.now() - TTL + 5 * 60000, data }; return data; } catch { throw error; }
  }
}

// Mods for one game: by Steam app id first, then by title/aliases.
function modsFor(data, { appid, name }) {
  const want = norm(name);
  const games = data.games.filter((g) => (appid && String(g.steam_appid || g.deploy?.steam_appid || '') === String(appid)) ||
    (want && [g.title, g.id, ...(g.aliases || [])].some((t) => norm(t) === want)));
  const out = [];
  for (const g of games) {
    for (const m of g.mods || []) {
      if (m.category !== 'game') continue;
      const artifacts = (m.artifacts || []).filter((a) => /\.addon(32|64)$/i.test(a.name) && data.assets[a.name] && data.assets[a.name].digest)
        .map((a) => ({ name: a.name, arch: /\.addon64$/i.test(a.name) ? 64 : 32, size: data.assets[a.name].size }));
      // Some mods are published only on Nexus Mods (Resident Evil Requiem).
      // Shown with a link instead of being hidden; nothing is downloaded.
      const nexusUrl = (m.urls || []).find((u) => /^nexus(_mods)?$/.test(u.kind) && /^https:\/\/www\.nexusmods\.com\//.test(u.url))?.url || null;
      if (!artifacts.length && !nexusUrl) continue;
      out.push({ id: m.id, title: m.title || g.title, variant: m.variant || null, status: m.status || null,
        maintainers: m.maintainers || [], notes: m.notes || [], api: m.deploy?.api || null,
        nexus: nexusUrl, nexusOnly: !artifacts.length, artifacts });
    }
  }
  return out;
}

async function download(data, artifact, cacheDir) {
  const asset = data.assets[artifact];
  if (!asset || !/^[0-9a-f]{64}$/.test(asset.digest) || !/^renodx-[\w.-]+\.addon(32|64)$/i.test(artifact)) throw fail('hdrErrUnknown', 'Not a RenoDX mod file');
  const dest = path.join(cacheDir, asset.digest.slice(0, 16), artifact);
  if (fs.existsSync(dest) && sha(fs.readFileSync(dest)) === asset.digest) return dest;
  const buf = await fetchBytes(asset.url);
  if (sha(buf) !== asset.digest) throw fail('hdrErrDigest', `${artifact} does not match the SHA-256 RenoDX published`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

module.exports = { catalog, modsFor, download, norm };
