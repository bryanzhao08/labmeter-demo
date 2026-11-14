/* The month check as one pure function, so the desktop app, tests and the MCP server all run the
   same code. No DOM, no network. */
(function(root){
'use strict';
const req=n=>typeof require!=='undefined'?require(n):null;
const E=root.LBReconcile||req('./reconcile-engine.js'),R=root.LBRates||req('./ratesheet.js'),S=root.LBSchedule||req('./schedule.js');
if(!root.LBRates)root.LBRates=R;
const H=root.LBHelpers||req('./helpers.js');
const GRACE_MINUTES=15;
const key=s=>String(s||'').trim().toLowerCase();
const money=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function parseCSV(text){
  text=String(text).replace(/^﻿/,'');
  const first=text.split(/\r?\n/,1)[0]||'';let delim=',';
  const n=c=>(first.match(c)||[]).length;
  if(n(/\t/g)>n(/,/g))delim='\t';else if(n(/;/g)>n(/,/g))delim=';';
  let rows=[],row=[],f='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;
    else if(c===delim){row.push(f);f=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}
    else f+=c;
  }
  if(f!==''||row.length){row.push(f);rows.push(row)}
  rows=rows.filter(r=>r.some(x=>String(x).trim()!==''));
  const head=(rows.shift()||[]).map(h=>String(h).trim());
  return {head,rows};
}

/* book: {name, table, detect}; logs: [{name, table, detect, machine}]; profile: saved billing rules. */
function check(profile,book,logs){
  const bn=E.normalize(book.table,book.detect.map,{events:false,format:book.detect.format,source:book.name}),usage=[];
  const issues=[...bn.issues];
  for(const u of logs){
    let table=u.table,map={...u.detect.map};
    if(map.instrument<0&&!u.machine){
      const head=[...table.head,'Inferred instrument'],records=bn.records;
      table={head,rows:table.rows.map(r=>{const user=key(r[map.user]),stamp=E.time(r[u.detect.events?map.timestamp:map.start],u.detect.format),day=Math.floor(stamp/1440),matches=[...new Set(records.filter(x=>key(x.user)===user&&Math.floor(x.s/1440)===day).map(x=>x.instrument))];return [...r,matches.length===1?matches[0]:'Unidentified instrument']})};
      map.instrument=head.length-1;
    }
    const un=E.normalize(table,map,{events:u.detect.events,format:u.detect.format,source:u.name,instrument:u.machine||''});
    usage.push(...un.records);issues.push(...un.issues);
  }
  const groups=new Map();
  for(const [kind,records] of [['book',bn.records],['use',usage]])for(const r of records){const k=key(r.instrument);if(!groups.has(k))groups.set(k,{name:r.instrument,book:[],use:[]});groups.get(k)[kind].push(r)}
  const rows=[];
  for(const g of groups.values()){
    const policy=H.policyFor(profile,g.name),part=E.reconcile(g.book,g.use,{...policy,aliases:{}});
    for(const r of part){
      r.policy=policy.basis;r.evidence=policy.evidence;
      // Ignore small overruns: logging in a few minutes early or out a few minutes late is normal. Billing still counts them.
      if(r.used-r.booked>=GRACE_MINUTES&&r.book.length&&r.use.length)r.flags.push('Use exceeded the booked time.');
      if(r.instrument==='Unidentified instrument')r.flags.push('Instrument could not be identified from the log.');
      if(Number(profile.alert_over)>0&&r.amount>Number(profile.alert_over))r.flags.push(`Charge is over your alert amount (${money(Number(profile.alert_over))}).`);
    }
    // A plain statistical check on session length within the month. It is not a trained model.
    for(const r of H.outliers(part))r.flags.push('Unusually long for this machine this month.');
    rows.push(...part);
  }
  rows.sort((a,b)=>a.day-b.day||a.instrument.localeCompare(b.instrument)||a.user.localeCompare(b.user));
  return {rows,issues};
}
/* Convenience for callers that hold raw tables: reservations table + log tables + rules. */
function checkTables(profile,reservationTable,logTables,names){
  const res=S.readReservations(reservationTable);
  const table=res?res.table:reservationTable;
  const book={name:(names&&names.reservations)||'reservations',table,detect:H.detectColumns(table,'book')};
  if(book.detect.missing.length)return {error:'The reservation file is missing columns: '+book.detect.missing.join(', '),rows:[],issues:[],reservations:res};
  const logs=(logTables||[]).map((t,i)=>({name:(names&&names.logs&&names.logs[i])||'log '+(i+1),table:t,detect:H.detectColumns(t,'use'),machine:''}));
  const bad=logs.find(l=>l.detect.missing.length);
  if(bad)return {error:bad.name+' is missing columns: '+bad.detect.missing.join(', '),rows:[],issues:[],reservations:res};
  return {...check(profile,book,logs),reservations:res};
}
function summary(rows,issues){
  const ready=rows.filter(r=>!r.flags.length),flags={};
  rows.forEach(r=>r.flags.forEach(f=>flags[f]=(flags[f]||0)+1));
  return {sessions:rows.length,ready:ready.length,needLook:rows.length-ready.length,readyAmount:Math.round(ready.reduce((n,r)=>n+r.amount,0)*100)/100,unreadableRows:issues.length,flags};
}
const API={check,checkTables,summary,parseCSV,GRACE_MINUTES};
root.LBMonth=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
