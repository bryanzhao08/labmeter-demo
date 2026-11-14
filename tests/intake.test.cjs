const assert=require('node:assert/strict'),fs=require('node:fs');
const I=require('../intake.js');
const parse=t=>{const rows=t.trim().split(/\r?\n/).map(l=>{const o=[];let c='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c);c=''}else c+=ch}o.push(c);return o});return {head:rows[0],rows:rows.slice(1)}};
const mock=n=>parse(fs.readFileSync(__dirname+'/../data/mock/'+n,'utf8'));
const r=I.classify(mock('fbs-reservations.csv')),l=I.classify(mock('usage-log.csv')),p=I.classify(mock('price-sheet.csv'));
assert.equal(r.kind,'reservations');assert.ok(r.rows>100&&r.cancelled>=2&&r.resources===4);
assert.equal(l.kind,'logs');assert.equal(l.layout,'events');assert.ok(l.hasInstrument&&l.last>=l.first);
assert.equal(p.kind,'prices');assert.ok(p.items>=7);
// the older six-row mock bookings file is also a reservation export
assert.equal(I.classify(mock('bookings.csv')).kind,'reservations');
assert.equal(I.classify({head:['Name','Score'],rows:[['a','1']]}).kind,'unknown');
assert.equal(I.classify({head:[],rows:[]}).kind,'unknown');
// defaults: newest reservation file and price sheet, logs only when they overlap the reservations
const e=(name,kind,info)=>({name,kind,info});
const list=I.pickDefaults([e('new.csv','reservations',{first:100,last:130}),e('old.csv','reservations',{first:10,last:40}),e('log-now.csv','logs',{first:101,last:129}),e('log-old.csv','logs',{first:10,last:39}),e('p1.csv','prices',{}),e('p2.csv','prices',{}),e('x.csv','unknown',{})]);
assert.deepEqual(list.map(x=>x.include),[true,false,true,false,true,false,false]);
// a choice the person made is kept when the folder is scanned again
const again=I.pickDefaults([e('new.csv','reservations',{first:100,last:130}),e('log-old.csv','logs',{first:10,last:39})],[{name:'log-old.csv',include:true},{name:'new.csv',include:true}]);
assert.deepEqual(again.map(x=>x.include),[true,true]);
// the report carries counts and column names only
const rep=I.buildReport({version:'0.5.0',platform:'Win32',date:'2026-11-12',folderConnected:true,files:[{kind:'reservations',include:true,rows:10,columns:['Resource','Reserved By']}],reservations:{count:9,cancelled:1,unread:0,columns:['Resource']},logs:[{layout:'events',rows:20,missing:[]}],prices:{items:8,tiers:['Internal'],afterHours:true,unplaced:1},analysis:{sessions:9,ready:7,needLook:2,unreadable:0,flags:{'Booking without observed use; confirm no-show policy.':2}}});
assert.match(rep,/9 read, 1 cancelled/);assert.match(rep,/Review flags: 2/);assert.doesNotMatch(rep,/Resource|Reserved By|Internal|Booking without observed use/);assert.match(rep,/omitted/);
// which booking system a web address belongs to
const d=x=>{const r=I.detectSystem(x);return r&&r.system};
assert.equal(d('usc.fbs.io'),'fbs');assert.equal(d('https://fbs.usc.edu/?p=592'),'fbs');assert.equal(d('https://mh-fbs1.caltech.edu/'),'fbs');
assert.equal(d('https://my.ilabsolutions.com/service_center/show_external/5582'),'ilab');assert.equal(I.detectSystem('https://my.ilabsolutions.com/service_center/show_external/5582').coreId,'5582');
assert.equal(d('https://uni.ilab.agilent.com/sc/1234/flow-core'),'ilab');assert.equal(I.detectSystem('https://uni.ilab.agilent.com/sc/1234/flow-core').coreId,'1234');
assert.equal(d('ppms.us/university/login'),'ppms');assert.equal(d('https://core.university.edu/ppms/'),'ppms');
assert.equal(d('https://lab.university.edu/booked/Web/schedule.php'),'booked');
assert.equal(d('https://www.google.com'),null);assert.equal(d('fbsomething.example.com'),null);assert.equal(d(''),null);assert.equal(d('not a url at all'),null);
console.log('intake tests pass');

assert.equal(I.classify({head:['Instrument','Rate'],rows:[['Scope','50']]}).kind,'prices');
