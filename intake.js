/* Works out what a file is (reservation export, instrument usage log, or price sheet) from its
   contents, so a folder of exports can be read without anyone naming the files. Also builds the
   test report: counts and column names only, never names, accounts or amounts. */
(function(root){
'use strict';
const S=root.LBSchedule||(typeof require!=='undefined'?require('./schedule.js'):null);
const R=root.LBRates||(typeof require!=='undefined'?require('./ratesheet.js'):null);
const H=root.LBHelpers||(typeof require!=='undefined'?require('./helpers.js'):null);
const E=root.LBReconcile||(typeof require!=='undefined'?require('./reconcile-engine.js'):null);

function logSpan(table,det){
  const col=det.events?det.map.timestamp:det.map.start;if(col==null||col<0)return null;
  let first=Infinity,last=-Infinity;
  for(const r of table.rows){const t=E.time(String(r[col]??'').trim(),det.format);if(Number.isFinite(t)){first=Math.min(first,t);last=Math.max(last,t)}}
  return Number.isFinite(first)?{first:Math.floor(first/1440),last:Math.floor(last/1440)}:null;
}
/* table: {head, rows}. Returns {kind: 'reservations'|'logs'|'prices'|'unknown', ...details}. */
function classify(table){
  if(!table||!table.head||!table.head.length||!table.rows||!table.rows.length)return {kind:'unknown',reason:'No rows'};
  const res=S.readReservations(table);
  if(res&&res.items.length){
    const days=res.items.map(i=>i.day);
    return {kind:'reservations',rows:res.items.length,cancelled:res.cancelled,unread:res.issues.length,first:Math.min(...days),last:Math.max(...days),resources:S.resources(res.items).length};
  }
  const det=H.detectColumns(table,'use');
  if(!det.missing.length){
    const span=logSpan(table,det);
    return {kind:'logs',rows:table.rows.length,layout:det.events?'events':'intervals',hasInstrument:det.map.instrument>=0,first:span&&span.first,last:span&&span.last};
  }
  const price=R.parseRates([table.head,...table.rows]);
  if(price.items.length>=2||(price.items.length===1&&table.head.some(h=>/^(?:instrument|resource|equipment|machine|service|item|name|description)$/i.test(String(h).trim()))&&table.head.some(h=>/^(?:rate|price|cost|fee|charge)(?:\s|$|\/)/i.test(String(h).trim()))))return {kind:'prices',items:price.items.length};
  return {kind:'unknown',reason:'Not a reservation export, usage log or price sheet'};
}

const KIND_LABEL={reservations:'Reservations',logs:'Usage log',prices:'Price sheet',unknown:'Not recognised',error:'Could not read'};
/* Pick which files to use: newest reservation export, newest price sheet, and logs that overlap the reservations. */
function pickDefaults(entries,previous){
  const prev=new Map((previous||[]).map(e=>[e.name,e.include]));
  const firstOf=kind=>entries.find(e=>e.kind===kind);
  const resv=firstOf('reservations'),price=firstOf('prices');
  for(const e of entries){
    if(prev.has(e.name)&&prev.get(e.name)!==undefined&&(previous||[]).length){e.include=prev.get(e.name);continue}
    if(e.kind==='reservations')e.include=e===resv;
    else if(e.kind==='prices')e.include=e===price;
    else if(e.kind==='logs'){const i=e.info;e.include=!resv||!i||i.first==null||(i.last>=resv.info.first-1&&i.first<=resv.info.last+1)}
    else e.include=false;
  }
  // Only one reservation export and one price sheet can be in use.
  let seenR=false,seenP=false;
  for(const e of entries){
    if(e.kind==='reservations'&&e.include){if(seenR)e.include=false;seenR=true}
    if(e.kind==='prices'&&e.include){if(seenP)e.include=false;seenP=true}
  }
  return entries;
}

/* Privacy-safe report a manager can send back: structure and counts only. */
function buildReport(x){
  const L=[],add=s=>L.push(s),details=x.allowDetails===true;
  add('LaBro test report');
  add('Folder connected: '+(x.folderConnected?'yes':'no'));
  if(x.files&&x.files.length){add('Files found: '+x.files.length);x.files.forEach((f,i)=>add('  '+(i+1)+'. '+(Object.hasOwn(KIND_LABEL,f.kind)?KIND_LABEL[f.kind]:'Unknown')+(f.include?' (in use)':'')+' · '+(Number(f.rows)||0)+' rows'+(details&&f.columns?' · columns: '+f.columns.join(' | '):'')))}
  add('Reservations: '+(x.reservations?(Number(x.reservations.count)||0)+' read, '+(Number(x.reservations.cancelled)||0)+' cancelled, '+(Number(x.reservations.unread)||0)+' unreadable'+(details&&x.reservations.columns?' · columns: '+x.reservations.columns.join(' | '):''):'none loaded'));
  add('Usage logs: '+(x.logs&&x.logs.length?x.logs.map(l=>(details?l.layout:'log')+', '+(Number(l.rows)||0)+' rows'+(details&&l.columns?' · columns: '+l.columns.join(' | '):'')).join('; '):'none loaded'));
  add('Prices: '+(x.prices?(Number(x.prices.items)||0)+' price rows, '+(x.prices.tiers||[]).length+' tiers'+(details?' ('+(x.prices.tiers||[]).join(', ')+')':'')+(x.prices.afterHours?', after-hours rates found':'')+(x.prices.unplaced?', '+Number(x.prices.unplaced)+' lines not placed':''):'none'));
  if(x.analysis){add('Analysis: '+(Number(x.analysis.sessions)||0)+' sessions, '+(Number(x.analysis.ready)||0)+' ready, '+(Number(x.analysis.needLook)||0)+' need a look, '+(Number(x.analysis.unreadable)||0)+' source rows unreadable');
    if(x.analysis.incomplete||x.analysis.unreadable)add('Analysis status: incomplete');
    if(details)Object.entries(x.analysis.flags||{}).forEach(([k,v])=>add('  '+Number(v)+' × '+k));
    else add('Review flags: '+Object.values(x.analysis.flags||{}).reduce((n,v)=>n+(Number(v)||0),0));
  }else add('Analysis: not run');
  add(details?'Detailed source labels may be sensitive.':'Source names, headings, and labels are omitted.');
  return L.join('\n');
}

/* Which booking system a web address belongs to. Only patterns we can explain; otherwise null. */
const SYSTEMS={
  fbs:{label:'FBS',maker:'Priority Software',connect:'folder'},
  ilab:{label:'iLab',maker:'Agilent',connect:'token'},
  ppms:{label:'PPMS',maker:'Stratocore',connect:'folder'},
  booked:{label:'Booked Scheduler',maker:'Twinkle Toes Software',connect:'folder'},
  bookitlab:{label:'Bookitlab',maker:'Bookitlab',connect:'folder'},
  qreserve:{label:'QReserve',maker:'QReserve',connect:'folder'},
  infinity:{label:'Infinity',maker:'Idea Elan',connect:'folder'}
};
function detectSystem(input){
  let text=String(input||'').trim();if(!text)return null;
  if(!/^[a-z]+:\/\//i.test(text))text='https://'+text;
  let u;try{u=new URL(text)}catch{return null}
  const host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase(),labels=host.split(/[.-]/);
  let system=null;
  if(labels.some(l=>/^fbs\d*$/.test(l)))system='fbs';
  else if(labels.some(l=>/^ilab(solutions)?$/.test(l)))system='ilab';
  else if(labels.some(l=>/^ppms$/.test(l))||/\/ppms(\/|$)/.test(path))system='ppms';
  else if(/(^|\.)bookitlab\.com$/.test(host))system='bookitlab';
  else if(/(^|\.)qreserve\.com$/.test(host))system='qreserve';
  else if(/(^|\.)ideaelan\.com$/.test(host))system='infinity';
  else if(/(^|\.)bookedscheduler\.com$/.test(host)||/\/web\/(schedule|dashboard|index)\.php/.test(path))system='booked';
  if(!system)return null;
  // An iLab web address often carries the core ID: .../service_center/show_external/5582 or /sc/5582/...
  let coreId='';if(system==='ilab'){const m=path.match(/\/(?:service_center\/(?:show_external\/)?|sc\/)(\d{2,8})/);if(m)coreId=m[1]}
  return {system,host,coreId,...SYSTEMS[system]};
}
const API={classify,pickDefaults,buildReport,KIND_LABEL,SYSTEMS,detectSystem};
root.LBIntake=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
