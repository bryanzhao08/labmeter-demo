/* Reads a reservation export (the kind of spreadsheet a booking system such as FBS lets a
   manager download) into reservations the schedule can draw, and into the canonical table the
   billing check reads. FBS has no public connection, so the export file is the source.
   Nothing here guesses a time: a row that cannot be read is reported, not repaired. */
(function(root){
'use strict';
const E=root.LBReconcile||(typeof require!=='undefined'?require('./reconcile-engine.js'):null);
const clean=v=>String(v??'').replace(/\s+/g,' ').trim(),lower=v=>clean(v).toLowerCase();
const HEAD={
  id:/^(?:reservation\s*(?:id|#|no\.?|number)|booking\s*(?:id|#|number)|res\.?\s*id|id)$/,
  resource:/^(?:resource|instrument|equipment|workstation|machine|asset|item|facility resource)$/,
  user:/^(?:reserved by|owner|user|user name|username|user full name|customer name|requested by|booked by|member|name)$/,
  lab:/^(?:lab|pi|group|principal investigator|department)$/,
  account:/^(?:account|pta|worktag|grant|funding|funding code|billing account|project)$/,
  status:/^(?:status|reservation status|state)$/,
  service:/^(?:reservation type|service type|service|mode|usage type|type)$/,
  tier:/^(?:user type|affiliation|rate tier|customer type|tier|membership|member type|rate type)$/
};
const col=(head,k)=>head.findIndex(h=>HEAD[k].test(lower(h)));
const pad=n=>String(n).padStart(2,'0');
function dateOf(v){const s=clean(v);let m=s.match(/(\d{4})-(\d{2})-(\d{2})/);if(m&&+m[1]>=1990)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(m){let y=+m[3];if(y<100)y+=2000;return y+'-'+pad(m[1])+'-'+pad(m[2])}return ''}
function timeOf(v){const s=clean(v).replace(/(\d{4})-(\d{2})-(\d{2})/,'').replace(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,'');
  const m=s.match(/^\s*T?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i);if(!m)return '';let h=+m[1];
  if(m[4]){if(h<1||h>12)return '';h=h%12+(/pm/i.test(m[4])?12:0)}if(h>23||+m[2]>59||(m[3]&&+m[3]>59))return '';return pad(h)+':'+m[2]}
/* Start or end side: a combined column, or a date column plus a time column. */
function sideColumns(head,prefix){
  const rx=prefix==='start'?/^(?:start|begin|from|check[- ]?in)\b/:/^(?:end|finish|to|check[- ]?out)\b/;
  return head.map((h,i)=>rx.test(lower(h))?i:-1).filter(i=>i>=0);
}
function stamp(row,cols){
  let date='',time='';
  for(const i of cols){const d=dateOf(row[i]);if(d&&!date)date=d}
  for(const i of cols){const c=row[i],t=timeOf(c);if(t&&!dateOf(c)){time=t;break}}
  if(!time)for(const i of cols){const c=row[i],t=timeOf(c);if(t&&dateOf(c)){time=t;break}}
  return date&&time?date+' '+time:'';
}
const cell=(row,i)=>i>=0?clean(row[i]):'';

function readReservations(table){
  const head=table.head||[];
  const c={};for(const k of Object.keys(HEAD))c[k]=col(head,k);
  const sc=sideColumns(head,'start'),ec=sideColumns(head,'end');
  if(c.resource<0||c.user<0||!sc.length||!ec.length)return null;
  const items=[],issues=[],canon=[];let cancelled=0;
  table.rows.forEach((row,n)=>{
    if(row.every(x=>!clean(x)))return;
    const ref='row '+(n+2),resource=cell(row,c.resource),user=cell(row,c.user),a=stamp(row,sc),b=stamp(row,ec);
    if(!resource||!user||!a||!b){issues.push(ref+': needs a resource, a user, and a start and end date and time.');return}
    const s=E.time(a,'iso'),e=E.time(b,'iso');
    if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s){issues.push(ref+': the end must come after the start.');return}
    const status=cell(row,c.status)||'Confirmed',isCancelled=/cancel/i.test(status);
    const it={id:cell(row,c.id)||'R'+(n+2),resource,user,lab:cell(row,c.lab),account:cell(row,c.account),status,service:cell(row,c.service),tier:cell(row,c.tier),start:s,end:e,day:Math.floor(s/1440),cancelled:isCancelled,ref};
    items.push(it);
    if(isCancelled){cancelled++;return}
    canon.push([it.id,resource,user,it.lab,it.account,a,b,it.service,it.tier]);
  });
  items.sort((x,y)=>x.start-y.start||x.resource.localeCompare(y.resource));
  return {items,cancelled,issues,table:{head:['Reservation ID','Resource','Owner','Lab','Account','Start','End','Reservation type','User type'],rows:canon},hasTier:c.tier>=0};
}

/* ---- calendar helpers (all times are local wall-clock minutes since 1970-01-01) ---- */
const MONTH=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const dow=day=>(day+4)%7;
const ymd=day=>new Date(day*86400000).toISOString().slice(0,10);
const dayFromYmd=s=>Math.floor(Date.parse(s+'T00:00:00Z')/86400000);
const fmtDay=day=>{const d=new Date(day*86400000);return DOW[d.getUTCDay()]+', '+MONTH[d.getUTCMonth()]+' '+d.getUTCDate()};
const fmtShortDay=day=>{const d=new Date(day*86400000);return MONTH[d.getUTCMonth()]+' '+d.getUTCDate()};
const fmtTime=min=>{const m=((min%1440)+1440)%1440,h=Math.floor(m/60),mm=m%60;return (h%12||12)+(mm?':'+pad(mm):'')+(h<12?' AM':' PM')};
const fmtClock=min=>{const m=((min%1440)+1440)%1440;return Math.floor(m/60)+':'+pad(m%60)};
const weekStart=day=>day-((dow(day)+6)%7);
const hoursText=min=>{const h=min/60;return (Math.round(h*100)/100).toString()+' h'};
/* Assign overlapping reservations on one resource to separate lanes. */
function lanes(list){
  const ends=[];return list.map(it=>{let l=ends.findIndex(e=>e<=it.start);if(l<0){l=ends.length;ends.push(0)}ends[l]=it.end;return l});
}
function resources(items){return Array.from(new Set(items.map(i=>i.resource))).sort((a,b)=>a.localeCompare(b))}
function busiestDay(items){const n=new Map();items.filter(i=>!i.cancelled).forEach(i=>n.set(i.day,(n.get(i.day)||0)+1));let best=null;n.forEach((v,k)=>{if(best===null||v>n.get(best)||(v===n.get(best)&&k<best))best=k});return best}
const API={readReservations,dateOf,timeOf,dow,ymd,dayFromYmd,fmtDay,fmtShortDay,fmtTime,fmtClock,weekStart,hoursText,lanes,resources,busiestDay};
root.LBSchedule=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
