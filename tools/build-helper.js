// Compiles tools/NvDrs.cs -> build/nv-drs.exe with the .NET Framework C# compiler
// that ships with every Windows 10/11 (no SDK needed).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'tools', 'NvDrs.cs');
const out = path.join(root, 'build', 'nv-drs.exe');
const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

if (!fs.existsSync(csc)) {
  console.error('csc.exe not found:', csc);
  process.exit(1);
}
if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
  console.log('nv-drs.exe is up to date');
  process.exit(0);
}
execFileSync(csc, ['-nologo', '-platform:x64', '-optimize', `-out:${out}`, src], { stdio: 'inherit' });
console.log('built', out);
