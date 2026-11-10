const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const {execFileSync} = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labro-test-'));
const script = path.resolve(__dirname, '../collector/labro-collector.ps1');
function run(user, idle) {
  execFileSync('pwsh', ['-NoProfile', '-File', script, '-OutDir', dir, '-FakeUser', user,
    '-FakeNow', '2026-10-01 09:00:00', '-FakeIdleSec', String(idle), '-Ticks', '3', '-Instrument', 'TEST-PC']);
}
run('active-user', 0); run('idle-user', 600);
const files = fs.readdirSync(dir);
assert.equal(files.length, 2, 'sessions must not overwrite each other');
global.window = {}; global.localStorage = {getItem: () => null, setItem: () => {}};
require('../audit.js');
for (const file of files) {
  const csv = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  assert.equal(lines.length, 2, 'ticks update one row');
  assert(lines[1].includes('2026-10-01 09:03:00,3,'), 'deterministic clock advances');
  assert(lines[1].includes(csv.includes('active-user') ? ',3,3,0,collector' : ',3,0,0,collector'));
  const C = window.LMAuditCore;
  C.setFile('res', 'reservations.csv', 'Resource,Username,Start,End\nTEST-PC,active-user,2026-10-01 09:00:00,2026-10-01 09:03:00');
  C.setFile('use', file, csv);
  assert.equal(C.build().use.length, 1, 'collector CSV imports into reconciliation');
}
console.log('collector: active/idle timing, isolated files, and app import passed');
