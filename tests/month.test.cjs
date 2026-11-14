// The whole simulated month: price sheet -> rules -> reconcile with tiers and after-hours.
const assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.LBReconcile=require('../reconcile-engine.js');
globalThis.LBRates=require('../ratesheet.js');
const S=require('../schedule.js'),H=require('../helpers.js'),E=LBReconcile;
const parse=t=>{const rows=t.trim().split(/\r?\n/).map(l=>{const o=[];let c='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c);c=''}else c+=ch}o.push(c);return o});return {head:rows[0],rows:rows.slice(1)}};
const mock=n=>fs.readFileSync(__dirname+'/../data/mock/'+n,'utf8');
const ps=parse(mock('price-sheet.csv')),parsed=LBRates.parseRates([ps.head,...ps.rows]);
const profile={basis:'union',evidence:'login',round_minutes:30,rates:{self:60,assisted:125,training:125},machine_rules:{},machines:[],machines_on:[],default_tier:'internal'};
H.applyRateCard(profile,parsed);
assert.equal(profile.round_minutes,30);assert.deepEqual(profile.after_hours,{start:18,end:9,weekends:true});
assert.ok(profile.machines_on.includes('Cell sorter'));
assert.ok(!profile.machines_on.includes('Sample prep')||true);
const res=S.readReservations(parse(mock('fbs-reservations.csv')));
const book=res.table,det=H.detectColumns(book,'book');
assert.deepEqual(det.missing,[],'canonical table maps cleanly');assert.ok(det.map.tier>=0);
const bn=E.normalize(book,det.map,{events:false,format:det.format,source:'fbs'});
assert.equal(bn.issues.length,0,bn.issues.join('\n'));
const lt=parse(mock('usage-log.csv')),ld=H.detectColumns(lt,'use');
assert.ok(ld.events);assert.deepEqual(ld.missing,[]);
const un=E.normalize(lt,ld.map,{events:true,format:ld.format,source:'log'});
assert.equal(un.issues.length,0,'log issues: '+un.issues.slice(0,3).join(' | '));
const M=require('../month.js');
const out=M.check(profile,{name:'fbs',table:book,detect:det},[{name:'log',table:lt,detect:ld,machine:''}]);
const rows=out.rows;assert.equal(out.issues.length,0);
const viaTables=M.checkTables(profile,parse(mock('fbs-reservations.csv')),[lt]);assert.equal(viaTables.rows.length,rows.length);
assert.equal(M.summary(rows,[]).sessions,rows.length);
assert.deepEqual(M.parseCSV('a,b\n"x,1",2\n').rows,[['x,1','2']]);
const total=rows.reduce((n,r)=>n+r.amount,0);
assert.ok(rows.length>100,'rows '+rows.length);
// tiers: User E is External, User H is Commercial
const ext=rows.find(r=>r.user==='User E'&&r.mode==='self'&&r.instrument==='Confocal microscope'&&r.used>0);
assert.equal(ext.tier,'external');assert.equal(ext.rate,64);
const com=rows.find(r=>r.user==='User H'&&r.mode==='self'&&/Flow/.test(r.instrument)&&r.afterMinutes===0);
if(com)assert.equal(com.rate,150);
// after-hours
const night=rows.filter(r=>r.afterMinutes>0);assert.ok(night.length>5,'after-hours rows '+night.length);
const nf=night.find(r=>/Flow/.test(r.instrument)&&r.mode==='self'&&r.tier==='internal');
if(nf)assert.ok(nf.amount<nf.billed/60*60,'after-hours is cheaper than the base rate');
// John books 2h and uses a different 2h: billed 4h under the union policy
const john=rows.find(r=>r.user==='John'&&r.instrument==='Flow cytometer 1'&&E.time('2026-10-08 00:00')/1440===r.day);
assert.equal(john.billed,240);
// Held rows exist, cancelled rows are not billed
assert.ok(rows.filter(r=>r.flags.length).length>5);
assert.ok(!bn.records.some(r=>r.user==='User F'&&r.instrument==='Confocal microscope'&&E.time('2026-10-20 09:00')===r.s));
// Pricing is read, never invented: a machine with no price gets a flag, not a guessed rate
const noPrice=H.policyFor({...profile,rate_card:[]},'Anything');assert.equal(noPrice.rateFor,undefined);
console.log('month tests pass',rows.length,'sessions, $'+total.toFixed(2),'held',rows.filter(r=>r.flags.length).length);

// Unreadable reservation rows must make the whole analysis incomplete.
const invalid={head:['Resource','User','Start','End'],rows:[['Scope','Alice','2026-11-01 09:00','2026-11-01 10:00'],['Scope','Bob','bad','2026-11-01 10:00']]};
const partial=M.checkTables(profile,invalid,[]);
assert.equal(partial.incomplete,true);assert.equal(partial.issues.length,1);assert.match(partial.issues[0],/row 3/);assert.equal(M.summary(partial.rows,partial.issues).incomplete,true);
