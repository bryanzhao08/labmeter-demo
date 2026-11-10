(function(root){
'use strict';
function parse(files, profile, core) {
  if(!profile.instrument.trim()) throw Error('Enter the instrument name used by your booking system.');
  const seen=new Set(), rows=[], issues=[];
  for(const file of files) {
    const table=core.parseCSV(file.text), ix={};
    for(const field of ['user','start','end']) {
      ix[field]=table.head.indexOf(profile[field]);
      if(ix[field]<0) throw Error(file.name+': missing column '+profile[field]+'. Select files with the same layout.');
    }
    table.rows.forEach((row,i)=>{
      const user=String(row[ix.user]||'').trim(), start=String(row[ix.start]||'').trim(), end=String(row[ix.end]||'').trim();
      const iso=profile.clock==='utc'? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/ : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;
      const s=Date.parse(profile.clock==='utc'?start:start.replace(' ','T')+'Z'), e=Date.parse(profile.clock==='utc'?end:end.replace(' ','T')+'Z');
      function valid(v,n){return Number.isFinite(n)&&new Date(n).toISOString().slice(0,19)===v.replace(' ','T').slice(0,19);}
      if(!user||!iso.test(start)||!iso.test(end)||!valid(start,s)||!valid(end,e)||e<=s) {
        issues.push(file.name+': row '+(i+2)+' needs a user and valid ISO start/end timestamps (end after start).'); return;
      }
      const key=JSON.stringify([user,s,e]);
      if(seen.has(key)) return; seen.add(key);
      rows.push({instrument:profile.instrument,user,start:start.replace(' ','T'),end:end.replace(' ','T'),minutes:(e-s)/60000,kind:profile.kind,clock:profile.clock,source:file.name,line:i+2});
    });
  }
  // Overlaps for one instrument are ambiguous; never silently sum them for billing.
  const ordered=rows.slice().sort((a,b)=>a.start.localeCompare(b.start));
  let latest=null;
  for(const r of ordered){if(latest&&r.start<latest.end) issues.push(r.source+': row '+r.line+' overlaps another interval; review the source before exporting.');if(!latest||r.end>latest.end)latest=r;}
  return {rows,issues};
}
function csv(result) {
  if(result.issues.length)throw Error('Resolve flagged records before exporting.');
  const cols=['Instrument','Username','Start','End','Minutes','Evidence type','Clock','Source file','Source row'];
  function cell(v){v=String(v);if(/^[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
  return [cols,...result.rows.map(r=>[r.instrument,r.user,r.start,r.end,r.minutes,r.kind,r.clock,r.source,r.line])].map(r=>r.map(cell).join(',')).join('\n');
}
const api={parse,csv};root.LBFolder=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
