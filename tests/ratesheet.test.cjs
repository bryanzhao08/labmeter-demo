const assert=require('node:assert/strict');
const {parseRates,itemsFor,rateFor}=require('../ratesheet.js');
const csv=t=>t.trim().split('\n').map(l=>l.split(','));
// A: one row per machine and mode, internal/external/after-hours columns
let a=parseRates(csv(`Core Facility Rates 2026,,,,,
Resource,Usage mode,Unit,Internal rate,External rate,After-hours rate
Flow cytometer 1,Self-service,per hour,$60,$96,$45
Flow cytometer 1,Staff-assisted,per hour,$125,$200,$95
Confocal microscope,Independent,per hour,$40,$64,
Confocal microscope,Training,per hour,$80,$128,
Sample prep,Per sample,per sample,$12,$20,
Unused hours are charged at 50% for cancellations under 24 hours notice. Billed in 30 minute increments.`));
assert.equal(a.items.length,5);
const f1=a.items.find(i=>i.machine==='Flow cytometer 1'&&i.mode==='self');
assert.deepEqual([f1.rates.internal,f1.rates.external,f1.after['*']],[60,96,45]);
assert.equal(a.items.find(i=>i.machine==='Sample prep').hourly,false);
assert.equal(a.round_minutes,30);assert.ok(a.notes.some(n=>/cancel/i.test(n)));
assert.ok(a.after_hours&&a.after_hours.start===18);
assert.deepEqual(a.tiers.map(t=>t.key),['internal','external']);
// B: section headings with mode-only rows and an "(after hours)" row
let b=parseRates(csv(`Service,Campus rate,External rate,Unit
Cell Sorter,,,
Assisted,$110,$180,hour
Assisted (after hours),$140,$220,hour
Independent,$70,$110,hour
Analyzer,,,
Independent,$35,$55,hour
After hours are 6PM to 9AM and weekends.`));
const s1=b.items.find(i=>i.machine==='Cell Sorter'&&i.mode==='assisted');
assert.ok(s1,JSON.stringify(b.items));
assert.equal(s1.rates.internal,110);assert.equal(s1.after.internal,140);assert.equal(s1.after.external,220);
assert.equal(b.items.find(i=>i.machine==='Analyzer'&&i.mode==='self').rates.external,55);
assert.equal(b.after_hours.weekends,true);
// C: five tiers, duplicated roles keep their own keys
let c=parseRates(csv(`Service,Unit,Internal Rate,External Affiliated Rate,External Academic Non-Profit Rate,External Start-Up Company Rate,External Commercial Rate
NMR 600,hour,$20,$30,$40,$60,$90`));
assert.equal(c.items.length,1);assert.equal(c.tiers.length,5);
assert.equal(Object.values(c.items[0].rates).join(),'20,30,40,60,90');
// D: pasted text
let d=parseRates(`Cell sorter: self-service $60/hr, assisted $125/hr, external $90/hr, after hours $45/hr
Confocal microscope
Training $80/hr
Billed in 15 minute increments.`);
const cs=itemsFor(d.items,'Cell sorter');
assert.equal(rateFor(cs,'self','internal'),60);assert.equal(rateFor(cs,'assisted','internal'),125);
assert.equal(rateFor(cs,'self','internal',true),45);
assert.equal(rateFor(itemsFor(d.items,'Confocal microscope'),'training','internal'),80);
assert.equal(d.round_minutes,15);
// Unrecognised text stays in unmatched, not invented
let e=parseRates('Some random sentence about the lab $ with no price\nAnother line');
assert.equal(e.items.length,0);
// Lab-wide rate rows (no machine name) apply to every machine
let g=parseRates(csv(`Item,Rate
Self-service,$55
Assisted,$120`));
assert.equal(rateFor(itemsFor(g.items,'Anything'),'assisted','internal'),120);
console.log('ratesheet tests pass');
