/* Pure evidence reconciliation. No fuzzy identity matching or invented session ends. */
(function(root){
'use strict';
const key=s=>String(s||'').trim().toLowerCase();
function time(value,format='iso'){
  let s=String(value||'').trim(),m;
  if(format==='us'&&(m=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i.exec(s))){
    let y=+m[3];if(y<100)y+=2000;let h=+m[4];
    if(m[7]){if(h<1||h>12)return NaN;h=h%12+(/pm/i.test(m[7])?12:0);}
    s=y+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0')+'T'+String(h).padStart(2,'0')+':'+m[5]+':'+(m[6]||'00');
  }
  if(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(s))return NaN;
  s=s.replace(' ','T');if(s.length===16)s+=':00';
  const n=Date.parse(s+'Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,19)===s?n/60000:NaN;
}
function normalize(table,map,opts){
  const records=[],issues=[];const get=(r,k)=>String(r[map[k]]??'').trim();
  table.rows.forEach((r,i)=>{
    if(r.every(x=>!String(x??'').trim()))return;
    const user=get(r,'user'), instrument=get(r,'instrument')||opts.instrument;
    const s=time(get(r,opts.events?'timestamp':'start'),opts.format);
    const ref=opts.source+': row '+(i+2);
    if(!user||!instrument||!Number.isFinite(s)){issues.push(ref+': missing identity/instrument or invalid timestamp.');return;}
    const base={user,instrument,s,ref,lab:get(r,'lab'),account:get(r,'account'),mode:get(r,'mode'),tier:get(r,'tier')};
    if(opts.events){
      const action=key(get(r,'event')).replace(/[.!]$/,'');
      const kind=/^(login successful|login|logon|log in)$/.test(action)?'in':/^(logout|logoff|log out)$/.test(action)?'out':null;
      if(!kind){issues.push(ref+': unrecognized event "'+get(r,'event')+'".');return;}
      records.push({...base,action:kind});
    }else{
      const e=time(get(r,'end'),opts.format);
      if(!Number.isFinite(e)||e<=s){issues.push(ref+': end must follow start.');return;}
      records.push({...base,e,flags:[]});
    }
  });
  if(!opts.events)return {records,issues};
  const open=new Map(),sessions=[],seen=new Set();
  records.sort((a,b)=>a.s-b.s).forEach(r=>{
    const k=key(r.instrument)+'|'+key(r.user),identity=k+'|'+r.s+'|'+r.action;
    if(seen.has(identity))return;seen.add(identity);
    if(r.action==='in'){
      if(open.has(k)){open.get(k).flags.push('Repeated login before logout; earliest login retained.');}
      else open.set(k,{...r,flags:[]});
    }else if(!open.has(k))issues.push(r.ref+': logout has no matching login.');
    else{
      const start=open.get(k);open.delete(k);
      if(r.s<=start.s){issues.push(r.ref+': zero-length or reversed session; check source.');return;}
      sessions.push({...start,e:r.s,ref:start.ref+' → '+r.ref});
    }
  });
  open.forEach(r=>issues.push(r.ref+': login has no logout. End time was not guessed.'));
  return {records:sessions,issues};
}
function merge(intervals){
  const out=[];intervals.slice().sort((a,b)=>a[0]-b[0]).forEach(v=>{
    const p=out[out.length-1];if(p&&v[0]<=p[1])p[1]=Math.max(p[1],v[1]);else out.push(v.slice());
  });return out;
}
const minutes=ivs=>merge(ivs).reduce((n,v)=>n+v[1]-v[0],0);
// Minutes of the merged intervals that fall outside business hours. Times are local wall-clock
// minutes since 1970-01-01, which was a Thursday.
function afterMinutes(ivs,win){
  if(!win)return 0;let total=0;
  merge(ivs).forEach(([a,b])=>{
    for(let t=a;t<b;){
      const dayStart=Math.floor(t/1440)*1440,next=Math.min(b,dayStart+1440),dow=(Math.floor(t/1440)+4)%7,weekend=dow===0||dow===6;
      if(win.weekends&&weekend){total+=next-t;t=next;continue}
      const open=dayStart+win.end*60,close=dayStart+win.start*60;
      // Business hours are [end, start) on a day; the rest of the day is after hours.
      const lo=Math.max(t,open),hi=Math.min(next,close),inHours=win.start>win.end?Math.max(0,hi-lo):0;
      total+=(next-t)-inHours;t=next;
    }
  });
  return total;
}
function reconcile(bookings,usage,policy){
  const groups=new Map(),aliases=policy.aliases||{};
  function add(r,kind){
    const user=aliases[key(r.user)]||r.user;
    // A boundary-spanning session is split for daily review; no duplicate time.
    for(let s=r.s;s<r.e;){
      const e=Math.min(r.e,(Math.floor(s/1440)+1)*1440),day=Math.floor(s/1440),k=key(r.instrument)+'|'+key(user)+'|'+day;
      if(!groups.has(k))groups.set(k,{id:k,instrument:r.instrument,user,day,book:[],use:[],refs:[],flags:[],labs:new Set(),accounts:new Set(),modes:new Set(),tiers:new Set()});
      const g=groups.get(k);g[kind].push([s,e]);g.refs.push(r.ref);g.flags.push(...(r.flags||[]));
      if(r.e> (Math.floor(r.s/1440)+1)*1440)g.flags.push('Cross-midnight interval split by day; review rounding.');
      if(kind==='book'){if(r.lab)g.labs.add(r.lab);if(r.account)g.accounts.add(r.account);if(r.mode)g.modes.add(key(r.mode));if(r.tier)g.tiers.add(key(r.tier));}
      s=e;
    }
  }
  bookings.forEach(r=>add(r,'book'));usage.forEach(r=>add(r,'use'));
  const rows=Array.from(groups.values()).map(g=>{
    const b=minutes(g.book),u=minutes(g.use);
    const basisIvs=policy.basis==='union'?[...g.book,...g.use]:policy.basis==='booked'?g.book:g.use;
    let basis=minutes(basisIvs);
    let modes=Array.from(g.modes),mode=modes[0]||'';
    if(/^(self[- ]?serve|self[- ]?service)$/.test(mode))mode='self';
    if(/^(assisted|staff[- ]?assisted|assistance)$/.test(mode))mode='assisted';
    if(mode==='training')mode='training';
    if(modes.length!==1||!['self','assisted','training'].includes(mode))g.flags.push('Select one service type in the source booking; missing or mixed types.');
    if(g.labs.size!==1)g.flags.push('Missing or multiple labs; confirm allocation.');
    if(g.accounts.size!==1)g.flags.push('Missing or multiple funding accounts; confirm allocation.');
    if(!g.book.length)g.flags.push('Usage without a matching booking or identity.');
    if(!g.use.length)g.flags.push('Booking without observed use; confirm no-show policy.');
    const rounded=Math.ceil(basis/policy.round-1e-9)*policy.round;
    const tiers=Array.from(g.tiers),tier=tiers.length===1?tiers[0]:(policy.defaultTier||'internal');
    if(tiers.length>1)g.flags.push('Mixed rate tiers in one day; confirm which rate applies.');
    const rateAt=after=>policy.rateFor?policy.rateFor(mode,tier,after):Number(policy.rates[mode]);
    const rate=rateAt(false),afterRate=rateAt(true);
    if(!Number.isFinite(rate)||rate<0)g.flags.push('No valid rate for service type.');
    const afterMin=basis>0?afterMinutes(basisIvs,policy.afterHours):0,afterBilled=basis>0?rounded*afterMin/basis:0;
    const okRate=Number.isFinite(rate)?rate:0,okAfter=Number.isFinite(afterRate)?afterRate:okRate;
    return {...g,book:merge(g.book),use:merge(g.use),booked:b,used:u,raw:basis,billed:rounded,rate:okRate,
      amount:Math.round(((rounded-afterBilled)/60*okRate+afterBilled/60*okAfter)*100)/100,
      mode,tier,afterMinutes:Math.round(afterBilled),afterRate:okAfter,lab:Array.from(g.labs).join(' / '),account:Array.from(g.accounts).join(' / '),
      refs:[...new Set(g.refs)],flags:[...new Set(g.flags)]};
  });
  // Shared instrument at overlapping times under different users is ambiguous.
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j];
    if(key(a.instrument)===key(b.instrument)&&key(a.user)!==key(b.user)&&a.use.some(x=>b.use.some(y=>x[0]<y[1]&&y[0]<x[1]))){
      a.flags.push('Overlapping use by different users.');b.flags.push('Overlapping use by different users.');
    }
  }
  return rows.sort((a,b)=>a.day-b.day||a.instrument.localeCompare(b.instrument)||a.user.localeCompare(b.user));
}
const API={time,normalize,merge,minutes,reconcile,afterMinutes};root.LBReconcile=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
