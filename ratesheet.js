/* Reads a core's price sheet (spreadsheet rows or pasted text) into a rate card.
   Pure functions, no network. The layouts handled here follow published core price lists:
   one row per instrument and usage mode, internal and external columns, an after-hours
   column or an "(after hours)" row, section headings that name the instrument, and
   footnotes that state rounding and cancellation policy. Anything not recognised is
   returned in `unmatched` so a person can check it. */
(function(root){
'use strict';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const lower=v=>clean(v).toLowerCase();
const money=v=>{const s=String(v??'').replace(/,/g,'');const m=s.match(/^\s*(?:USD\s*)?\$?\s*(\d+(?:\.\d{1,4})?)\b/i);return m?+m[1]:NaN};
const hasMoney=v=>Number.isFinite(money(v));

const ROLE=[
  ['after',/after[- ]?hours?|off[- ]?hours?|extended|overtime|weekend|evening|night/],
  ['commercial',/commercial|industry|industrial|for[- ]?profit|corporate|private|start[- ]?up/],
  ['external',/external|outside|non[- ]?(?:university|uni\w*|profit|member)|academic|visitor|other (?:institution|universit)/],
  ['internal',/internal|member|campus|home|intramural|university|affiliat\w*|in[- ]house/],
  ['rate',/^(?:rate|price|cost|fee|charge|\$)|\b(?:rate|price|cost|fee)s?$/],
  ['unit',/^(?:unit|uom|per|units?(?: of measure\w*)?|billing unit|basis)$/],
  ['mode',/^(?:mode|usage(?: mode)?|type|service type|assistance|access|level|option)$/],
  ['name',/service|instrument|resource|equipment|item|description|machine|name|facility|analysis|core/]
];
function roleOf(head){const h=lower(head);if(!h)return '';for(const [role,rx] of ROLE)if(rx.test(h))return role;return ''}

const MODE=[
  ['training',/\b(?:training|instruction|orientation|tutorial|onboarding)\b/],
  ['assisted',/\b(?:staff[- ]?assisted|assisted|operator|full[- ]?service|staff[- ]?run|technician)\b/],
  ['self',/\b(?:un[- ]?assisted|self[- ]?serv\w*|independent|self[- ]?operat\w*|self|walk[- ]?up|operator[- ]?free|user[- ]?operated)\b/]
];
function modeOf(text){const t=lower(text);for(const [m,rx] of MODE)if(rx.test(t)){if(m==='assisted'&&/\bun[- ]?assisted\b/.test(t))return 'self';return m}return ''}
const AFTER_RX=/after[- ]?hours?|off[- ]?hours?|extended[- ]?(?:hours?|rate)|overtime|weekend|evening|night/i;
const stripMode=text=>clean(String(text||'').replace(/\(\s*(?:[^)]*)\)/g,m=>(modeOf(m)||AFTER_RX.test(m)||/hourly|per hour/i.test(m))?'':m).replace(AFTER_RX,'').replace(/\b(?:staff[- ]?assisted|un[- ]?assisted|assisted|self[- ]?serv\w*|independent|training|operator|full[- ]?service|rate|price|usage|use)\b/gi,'').replace(/[-–—:,/|]+\s*$/,'').replace(/^[-–—:,/|]+\s*/,'').replace(/\s*[-–—:]\s*$/,''));

function unitOf(text){const t=lower(text);if(/\b(?:per\s+)?(?:hr|hrs|hour|hourly|h)\b|\/\s*h/.test(t))return 'hour';
  const m=t.match(/\b(?:per\s+|\/\s*)?(sample|slide|well|plate|run|session|day|month|each|item|kit|prep|analysis|minute|min|gb|tb)s?\b/);return m?(m[1]==='min'?'minute':m[1]):''}
const hourly=u=>!u||u==='hour';

function windowFrom(text){
  const t=lower(text),out={};let m;
  if((m=t.match(/after\s+(\d{1,2})(?::\d{2})?\s*(am|pm)/)))out.start=(+m[1]%12)+(m[2]==='pm'?12:0);
  if((m=t.match(/before\s+(\d{1,2})(?::\d{2})?\s*(am|pm)/)))out.end=(+m[1]%12)+(m[2]==='pm'?12:0);
  if(/weekends?|saturday|sunday/.test(t))out.weekends=true;
  return Object.keys(out).length?out:null;
}
function roundFrom(text){const t=lower(text);let m;
  if((m=t.match(/(\d{1,2})[- ]?min(?:ute)?s?[- ]?(?:increments?|steps?|blocks?|intervals?)/)))return +m[1];
  if((m=t.match(/round(?:ed|ing)?\s*(?:up)?\s*(?:to|in)?\s*(?:the\s+)?(?:nearest\s+)?(\d{1,2})[- ]?min/)))return +m[1];
  if(/half[- ]hour/.test(t))return 30;if(/quarter[- ]hour/.test(t))return 15;return null}
const POLICY_RX=/cancel|no[- ]?show|minimum|surcharge|increment|rounded|round up|overrun|late|penalt|fee applies|billed|charged|after[- ]?hours|weekend|note/i;

function newResult(){return {items:[],tiers:[],notes:[],unmatched:[],after_hours:null,round_minutes:null,source:'table'}}
function addTier(res,key,label){if(!res.tiers.some(t=>t.key===key))res.tiers.push({key,label:label||key})}
function findItem(res,machine,mode,unit){return res.items.find(i=>i.machine.toLowerCase()===machine.toLowerCase()&&i.mode===mode&&i.unit===unit)}
function upsert(res,machine,mode,unit,line){let it=findItem(res,machine,mode,unit);if(!it){it={machine,mode,unit,hourly:hourly(unit),rates:{},after:{},line};res.items.push(it)}return it}
function notePolicy(res,text){const t=clean(text);if(!t)return;res.notes.push(t);const w=windowFrom(t);if(w&&/after|before|weekend/i.test(t))res.after_hours={...(res.after_hours||{}),...w};const r=roundFrom(t);if(r&&!res.round_minutes)res.round_minutes=r}
function finish(res){
  // A tier that only appears on after-hours rows still counts as a tier.
  res.items.forEach(i=>Object.keys(i.rates).forEach(k=>{if(!res.tiers.some(t=>t.key===k))addTier(res,k,k)}));
  if(res.items.some(i=>Object.keys(i.after).length)&&!res.after_hours)res.after_hours={};
  if(res.after_hours){res.after_hours={start:res.after_hours.start??18,end:res.after_hours.end??9,weekends:res.after_hours.weekends??true,guessed:res.after_hours.start==null||res.after_hours.end==null}}
  return res;
}

/* rows: array of arrays (first rows may be a title). */
function parseRateTable(rows,opts){
  const res=newResult();const grid=(rows||[]).map(r=>(r||[]).map(clean));
  let hi=-1,best=0,roles=[];
  for(let i=0;i<Math.min(grid.length,25);i++){
    const rs=grid[i].map(roleOf),rateCols=rs.filter(r=>['after','commercial','external','internal','rate'].includes(r)).length,hasName=rs.includes('name')||rs[0]===''||true;
    const score=rateCols*2+(rs.includes('name')?1:0)+(rs.includes('unit')?1:0);
    if(rateCols>=1&&hasName&&score>best){best=score;hi=i;roles=rs}
  }
  if(hi<0)return null;
  const head=grid[hi];
  // Which column holds the instrument or service name: a labelled one, else the first text column.
  let nameCol=roles.indexOf('name');if(nameCol<0)nameCol=roles.findIndex((r,i)=>!r&&head[i]===''&&i===0)>=0?0:roles.findIndex(r=>!r);if(nameCol<0)nameCol=0;
  const modeCol=roles.indexOf('mode'),unitCol=roles.indexOf('unit');
  const cols=[];const seen={};
  roles.forEach((r,i)=>{if(i===nameCol||!['after','commercial','external','internal','rate'].includes(r))return;
    let key=r==='rate'?'internal':r;if(r==='after')key='after';else{if(seen[key]){key=lower(head[i]).replace(/\s*(?:rate|price|per hour|\/hr)\s*$/,'').replace(/[^a-z0-9]+/g,' ').trim()||key+(seen[key]+1)}}
    seen[r==='rate'?'internal':r]=(seen[r==='rate'?'internal':r]||0)+1;cols.push({i,key,label:head[i]||key,role:r});if(key!=='after')addTier(res,key,labelFor(key,head[i]))});
  const headUnit=unitOf(head.filter((h,i)=>i!==nameCol&&/per |\/|hourly|\bhrs?\b|hour/i.test(h)).join(' '));
  let section=(opts&&opts.section)||'';
  for(let r=hi+1;r<grid.length;r++){
    const row=grid[r];if(row.every(c=>!c))continue;
    const name=row[nameCol]||'';
    const priced=cols.filter(c=>hasMoney(row[c.i]));
    if(!priced.length){
      const text=row.filter(Boolean).join(' ');
      if(!text)continue;
      if(text.length>60||POLICY_RX.test(text)){notePolicy(res,text);continue}
      if(name&&row.filter(Boolean).length===1){section=stripMode(name)||clean(name);continue}
      res.unmatched.push(text);continue;
    }
    const modeText=modeCol>=0?row[modeCol]:'';
    const isAfter=AFTER_RX.test(name+' '+modeText);
    let mode=modeOf(modeText)||modeOf(name)||'any';
    let machine=stripMode(name);
    if(!machine||machine.length<2)machine=section;
    else if(!name||(modeOf(name)&&!stripMode(name)))machine=section;
    const unit=(unitCol>=0&&unitOf(row[unitCol]))||unitOf(priced.map(c=>row[c.i]).join(' '))||unitOf(name)||headUnit||'';
    const it=upsert(res,machine||'',mode,unit,row.filter(Boolean).join(' | '));
    for(const c of priced){
      const v=money(row[c.i]);
      if(c.role==='after'){it.after['*']=v}
      else if(isAfter)it.after[c.key]=v;
      else it.rates[c.key]=v;
    }
  }
  res.items=res.items.filter(i=>Object.keys(i.rates).length||Object.keys(i.after).length);
  return res.items.length?finish(res):null;
}

/* Pasted text such as "Cell sorter: self-service $60/hr, assisted $125/hr, external $90/hr, after hours $45/hr". */
function parseRateText(text,machineTerm){
  const res=newResult();res.source='text';
  const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);
  let section='';
  for(const line of lines){
    if(!/\$\s?\d|\d\s*(?:\/|per)\s*(?:hr|hour)/i.test(line)){
      if(line.length>70||POLICY_RX.test(line)){notePolicy(res,line);continue}
      const heading=line.replace(/[:\-–—]+\s*$/,'');if(heading.split(' ').length<=6&&!/^[\d$]/.test(heading)){section=heading;continue}
      res.unmatched.push(line);continue;
    }
    let machine=section,rest=line;
    const lead=line.match(/^([^:$]{2,60}?)\s*[:\-–—]\s*(.*)$/);
    if(lead&&!/^\s*(?:self|assisted|training|internal|external|commercial|after)/i.test(lead[1])){machine=stripMode(lead[1])||clean(lead[1]);rest=lead[2]}
    else if(machineTerm&&machineTerm.test(line)){const m=line.match(/^(.{2,60}?)\s+(?:is|are|costs?|at|for|\$)/i);if(m&&machineTerm.test(m[1]))machine=clean(m[1]);}
    const segs=rest.split(/[;,]|\band\b(?=\s+(?:assisted|self|training|external|internal|commercial|after))/i).map(clean).filter(Boolean);
    let any=false;
    for(const seg of segs){
      const amounts=[...seg.matchAll(/\$\s?(\d+(?:\.\d{1,4})?)|(\d+(?:\.\d{1,4})?)\s*(?:\/|per)\s*(?:hr|hour)/gi)];
      if(!amounts.length)continue;
      const v=+(amounts[0][1]||amounts[0][2]);
      const mode=modeOf(seg)||'any',unit=unitOf(seg)||'hour';
      const tier=/commercial|industry|for[- ]?profit|corporate/i.test(seg)?'commercial':/external|outside|non[- ]?profit|academic/i.test(seg)?'external':'internal';
      const it=upsert(res,machine,mode,unit,line);
      if(AFTER_RX.test(seg))it.after[tier]=v;else it.rates[tier]=v;
      addTier(res,tier,labelFor(tier));any=true;
    }
    if(!any)res.unmatched.push(line);
  }
  res.items=res.items.filter(i=>Object.keys(i.rates).length||Object.keys(i.after).length);
  return res.items.length||res.notes.length?finish(res):null;
}
function labelFor(key,head){return {internal:'Internal',external:'External',commercial:'Commercial'}[key]||clean(head||key).replace(/\s*(?:rate|price)\s*$/i,'').replace(/^\w/,c=>c.toUpperCase())}

/* Accepts rows (array of arrays) or text. Rows that do not look like a table fall back to text. */
function parseRates(input,machineTerm,opts){
  if(Array.isArray(input)){const t=parseRateTable(input,opts);if(t)return t;input=input.map(r=>(r||[]).filter(c=>String(c??'').trim()).join(': ')).join('\n')}
  const text=String(input||'');
  if(/[\t,]/.test(text.split(/\r?\n/)[0]||'')&&text.split(/\r?\n/).length>2){const rows=text.split(/\r?\n/).map(l=>l.split(text.includes('\t')?'\t':','));const t=parseRateTable(rows,opts);if(t)return t}
  return parseRateText(text,machineTerm)||newResult();
}

/* Convert a rate card to what the engine needs for one machine. */
const nameMatch=(a,b)=>{const x=lower(a),y=lower(b);return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x))};
function itemsFor(card,machine){
  const all=(card||[]).filter(i=>i.hourly!==false);
  const specific=all.filter(i=>i.machine&&nameMatch(i.machine,machine));
  return specific.length?specific:all.filter(i=>!i.machine);
}
function rateFor(items,mode,tier,after){
  const pick=items.find(i=>i.mode===mode)||items.find(i=>i.mode==='any');
  if(!pick)return NaN;
  const base=pick.rates[tier]??pick.rates.internal??Object.values(pick.rates)[0];
  if(!after)return base;
  const any=items.find(i=>i.mode==='any'&&i!==pick);
  const a=pick.after[tier]??pick.after['*']??any?.after[tier]??any?.after['*'];
  return a==null?base:a;
}
function merge(list){
  const out=newResult();
  for(const r of list.filter(Boolean)){
    for(const it of r.items){const dup=findItem(out,it.machine,it.mode,it.unit);if(dup){Object.assign(dup.rates,{...it.rates,...dup.rates});Object.assign(dup.after,{...it.after,...dup.after})}else out.items.push(it)}
    r.tiers.forEach(t=>addTier(out,t.key,t.label));out.notes.push(...r.notes);out.unmatched.push(...r.unmatched);
    if(r.after_hours&&!out.after_hours)out.after_hours={start:r.after_hours.start,end:r.after_hours.end,weekends:r.after_hours.weekends};
    if(r.round_minutes&&!out.round_minutes)out.round_minutes=r.round_minutes;
  }
  out.notes=[...new Set(out.notes)];out.unmatched=[...new Set(out.unmatched)];
  if(out.after_hours)out.after_hours={...out.after_hours,guessed:false};
  return out;
}
const API={merge,parseRates,parseRateTable,parseRateText,itemsFor,rateFor,windowFrom,roundFrom,roleOf,modeOf,unitOf};
root.LBRates=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
