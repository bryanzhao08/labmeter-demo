const assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.LBReconcile=require('../reconcile-engine.js');
const S=require('../schedule.js');
const R=require('../ratesheet.js');
const parse=t=>{const rows=t.trim().split(/\r?\n/).map(l=>{const o=[];let c='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c);c=''}else c+=ch}o.push(c);return o});return {head:rows[0],rows:rows.slice(1)}};
const mock=n=>fs.readFileSync(__dirname+'/../data/mock/'+n,'utf8');
const t=parse(mock('fbs-reservations.csv'));
const r=S.readReservations(t);
assert.ok(r,'reads the FBS export');
assert.equal(r.items.length,t.rows.length);
assert.equal(r.cancelled,r.items.filter(i=>i.cancelled).length);assert.ok(r.cancelled>=2);
assert.equal(r.table.rows.length,r.items.length-r.cancelled);
assert.equal(r.issues.length,0);
assert.ok(r.hasTier);
// Date and time in separate columns, 12-hour clock, and Excel-style 1899 time cells
const x=S.readReservations({head:['Resource','Reserved By','Start Date','Start Time','End Date','End Time'],rows:[['Cell sorter','User A','2026-10-01 00:00:00','1899-12-30 08:45:00','2026-10-01 00:00:00','1899-12-30 12:45:00']]});
assert.equal(x.items[0].end-x.items[0].start,240);
assert.equal(S.fmtTime(x.items[0].start),'8:45 AM');
// A row that cannot be read is reported, not guessed
const bad=S.readReservations({head:['Resource','User','Start','End'],rows:[['A','B','2026-10-01 09:00','2026-10-01 08:00'],['A','B','not a date','2026-10-01 08:00']]});
assert.equal(bad.items.length,0);assert.equal(bad.issues.length,2);
// Not a reservation file at all
assert.equal(S.readReservations({head:['Name','Score'],rows:[['a','1']]}),null);
// Whole mock month through the engine with the sample price sheet
const rate=R.parseRates(parse(mock('price-sheet.csv')).rows.length?[parse(mock('price-sheet.csv')).head,...parse(mock('price-sheet.csv')).rows]:[]);
assert.ok(rate.items.length===8,JSON.stringify(rate.items.map(i=>i.machine+'/'+i.mode)));
assert.equal(rate.round_minutes,30);assert.equal(rate.after_hours.start,18);assert.equal(rate.after_hours.end,9);assert.equal(rate.after_hours.weekends,true);
const fc=R.itemsFor(rate.items,'Flow cytometer 1');
assert.equal(R.rateFor(fc,'self','internal'),60);assert.equal(R.rateFor(fc,'self','commercial'),150);assert.equal(R.rateFor(fc,'self','internal',true),45);
assert.equal(R.rateFor(fc,'assisted','external'),200);
assert.equal(R.itemsFor(rate.items,'Sample prep').length,0,'per-sample items are not hourly');
// S.weekStart is a Monday
assert.equal(S.dow(S.weekStart(S.dayFromYmd('2026-10-08'))),1);
// Lanes split overlaps
assert.deepEqual(S.lanes([{start:0,end:60},{start:30,end:90},{start:60,end:120}]),[0,1,0]);
console.log('schedule tests pass');
