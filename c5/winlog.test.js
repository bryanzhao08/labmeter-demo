var assert = require('assert');
var fs = require('fs');
var api = require('./winlog');
assert(api.isWinLog(['keywords', 'DATE AND TIME', 'Event Id']));
assert(api.isWinLog(['TimeCreated', 'Id']));
assert(!api.isWinLog(['TimeCreated']));
var sample = api.toSessions(fs.readFileSync(__dirname + '/sample_security_log.csv', 'utf8'));
assert.strictEqual(sample.sessions.length, 4);
assert.deepStrictEqual(sample.sessions[0], { workstation: 'FORTESSA-PC', user: 'arjunpat', start: '2026-10-01 08:00:00', end: '2026-10-01 11:00:00', endReason: 'next-logon' });
assert.strictEqual(sample.sessions[1].endReason, '4634');
assert.strictEqual(sample.sessions[2].endReason, '4647');
assert.strictEqual(sample.warnings[0], '1 unmatched logon.');
assert.strictEqual(sample.csv.split('\n')[0], 'Workstation,Username,Logon Time,Logoff Time');
var explicit = [
  'TimeCreated;Id;MachineName;TargetUserName;TargetLogonId;LogonType',
  '2026-10-02T08:00:00Z;4624;PC;alice;0xAb;10',
  '2026-10-02T08:01:00Z;4624;PC;bob;0xCD;11',
  '2026-10-02T09:00:00Z;4634;PC;bob;0xcd;',
  '2026-10-02T10:00:00Z;4647;PC;alice;0xaB;',
  '2026-10-02T11:00:00Z;4624;PC;SYSTEM;0x1;2',
  '2026-10-02T11:01:00Z;4624;PC;LOCAL SERVICE;0x2;2',
  '2026-10-02T11:02:00Z;4624;PC;NETWORK SERVICE;0x3;2',
  '2026-10-02T11:03:00Z;4624;PC;UMFD-1;0x4;2',
  '2026-10-02T11:04:00Z;4624;PC;joe;0x5;5',
  '2026-10-02T12:00:00Z;4624;PC;carol;0x6;2'
].join('\n');
var result = api.toSessions(explicit, { maxHours: 2 });
assert.strictEqual(result.sessions.length, 3);
assert.strictEqual(result.sessions[0].end, '2026-10-02 10:00:00');
assert.strictEqual(result.sessions[1].end, '2026-10-02 09:00:00');
assert.strictEqual(result.sessions[2].end, '2026-10-02 14:00:00');
assert.strictEqual(result.sessions[2].endReason, 'capped');
var quoted = 'Date and Time\tEvent ID\tDescription\n"10/3/2026 1:02:03 PM"\t4624\t"Subject:\n Account Name: SYSTEM\n Logon ID: 0x3e7\nNew Logon:\n Account Name: "+'""'+'Doe, Jane'+ '""' +'\n Logon ID: 0x99\nLogon Type: 2\nOther: text, here"';
var q = api.toSessions(quoted, { computer: 'fallback' });
assert.strictEqual(q.sessions[0].user, '"Doe, Jane"');
assert.strictEqual(q.sessions[0].workstation, 'fallback');
assert(q.csv.indexOf('"""Doe, Jane"""') >= 0);
console.log('ok');
