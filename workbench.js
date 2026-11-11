(()=>{
'use strict';
const $=id=>document.getElementById(id),E=LBReconcile,C=LMAuditCore;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const fields={book:['instrument','user','start','end','lab','account','mode'],use:['instrument','user','start','end','timestamp','event']};
const labels={instrument:'Instrument',user:'User / booking owner',start:'Start time',end:'End time',lab:'Lab / PI',account:'Funding account',mode:'Service type',timestamp:'Event timestamp',event:'Event description'};
const patterns={instrument:/^(resource|instrument|workstation|equipment)$/i,user:/^(owner|user full name|username|user|operator|customer name)$/i,start:/^(begin|start|login|logon time)$/i,end:/^(end|finish|logout|logoff time)$/i,lab:/^(lab|pi|group)$/i,account:/^(pta|account|worktag|grant)$/i,mode:/^(reservation type|reservation|service type|mode)$/i,timestamp:/^(timestamp|date and time)$/i,event:/^(record|event|action)$/i};
let sources={},rows=[],issues=[],approved={},versions={book:0,use:0},profile={};
try{profile=JSON.parse(localStorage.getItem('labro-reconcile-profile')||'{}');}catch{}
for(const id of ['basis','round','evidence','self-rate','assisted-rate','training-rate','aliases'])if(profile[id]!=null)$(id).value=profile[id];
function clear(){rows=[];issues=[];approved={};$('results').innerHTML='<p class="muted">Inputs changed. Reconcile again to refresh the review.</p>';}
function status(s){$('message').textContent=s;}
function config(kind){
  const src=sources[kind],table=src.table,prior=profile[kind]||{};
  const options=table.head.map((h,i)=>'<option value="'+i+'">'+esc(h||'(unnamed column '+(i+1)+')')+'</option>').join('');
  const sheet=src.workbook?'<label>Worksheet<select id="'+kind+'-sheet">'+src.workbook.SheetNames.map(n=>'<option '+(n===src.sheet?'selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>':'';
  $(kind+'-config').innerHTML='<p class="small muted">'+esc(src.name)+' · '+table.rows.length+' rows</p>'+sheet+
    (kind==='use'?'<div class="mapping-grid"><label>Log layout<select id="use-layout"><option value="intervals">Paired start and end</option><option value="events">Raw login / logout events</option></select></label><label>Instrument if absent<input id="use-instrument" placeholder="Exact booking resource name"></label></div>':'')+
    '<label>Timestamp format<select id="'+kind+'-format"><option value="iso">YYYY-MM-DD HH:mm:ss</option><option value="us">US M/D/YY or M/D/YYYY (years 2000–2099)</option></select></label>'+
    '<details open><summary>Map columns</summary><div class="mapping-grid">'+fields[kind].map(k=>'<label data-field="'+k+'">'+labels[k]+'<select id="'+kind+'-'+k+'"><option value="-1">Not provided</option>'+options+'</select></label>').join('')+'</div></details>'+
    '<details><summary>Original rows</summary><div class="source-preview"><table><thead><tr>'+table.head.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.slice(0,4).map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
  for(const field of fields[kind]){
    const saved=prior[field],idx=table.head.indexOf(saved);
    $(kind+'-'+field).value=idx>=0?idx:table.head.findIndex(h=>patterns[field].test(h));
  }
  $(kind+'-format').value=prior.format||((table.rows[0]||[]).some(v=>/^\d{1,2}\/\d{1,2}\//.test(v))?'us':'iso');
  if(kind==='use'){
    $('use-layout').value=table.head.some(h=>patterns.event.test(h))?'events':'intervals';
    $('use-instrument').value=prior.instrument||'';
    layout();
  }
  if(src.workbook)$(kind+'-sheet').onchange=()=>{clear();src.sheet=$(kind+'-sheet').value;src.table=C.parseCSV(XLSX.utils.sheet_to_csv(src.workbook.Sheets[src.sheet],{rawNumbers:false}));config(kind);};
}
function layout(){const events=$('use-layout').value==='events';for(const k of ['start','end','timestamp','event'])$('use-'+k).closest('label').hidden=events?['start','end'].includes(k):['timestamp','event'].includes(k);}
for(const kind of ['book','use']){
  $(kind+'-file').onchange=async()=>{
    const f=$(kind+'-file').files[0];if(!f)return;const version=++versions[kind];clear();
    try{
      if(f.size>20*1024*1024)throw Error('Choose an export smaller than 20 MB.');
      let src={name:f.name};
      if(/\.xlsx?$/i.test(f.name)){
        src.workbook=XLSX.read(await f.arrayBuffer(),{cellDates:true,dateNF:'yyyy-mm-dd hh:mm:ss'});
        src.sheet=src.workbook.SheetNames[0];src.table=C.parseCSV(XLSX.utils.sheet_to_csv(src.workbook.Sheets[src.sheet],{rawNumbers:false}));
      }else src.table=C.parseCSV(await f.text());
      if(version!==versions[kind])return;
      sources[kind]=src;config(kind);$('dataset').textContent='Your files · local only';status('File loaded. Check the worksheet and column choices.');
    }catch(e){if(version!==versions[kind])return;delete sources[kind];$(kind+'-config').textContent='Import failed. Choose another file.';status(e.message);}
  };
  $(kind+'-config').addEventListener('change',e=>{clear();if(e.target.id==='use-layout')layout();});
}
function mapping(kind){return Object.fromEntries(fields[kind].map(k=>[k,+$(kind+'-'+k).value]));}
function policy(){
  const aliases={};
  for(const line of $('aliases').value.split('\n').filter(s=>s.trim())){
    const parts=line.split('=').map(s=>s.trim());if(parts.length!==2||!parts[0]||!parts[1])throw Error('Use one alias = booking name per line.');
    aliases[parts[0].toLowerCase()]=parts[1];
  }
  const rates={self:Number($('self-rate').value),assisted:Number($('assisted-rate').value),training:Number($('training-rate').value)};
  if(Object.entries(rates).some(([k,v])=>!Number.isFinite(v)||v<0||$(k+'-rate').value===''))throw Error('Enter non-negative hourly rates.');
  return {basis:$('basis').value,round:+$('round').value,rates,aliases};
}
for(const id of ['basis','round','evidence','self-rate','assisted-rate','training-rate','aliases'])$(id).addEventListener('input',clear);
$('save-profile').onclick=()=>{
  try{
    const p=Object.fromEntries(['basis','round','evidence','self-rate','assisted-rate','training-rate','aliases'].map(id=>[id,$(id).value]));
    for(const kind of ['book','use'])if(sources[kind])p[kind]={...Object.fromEntries(fields[kind].map(k=>[k,sources[kind].table.head[+$(kind+'-'+k).value]||''])),format:$(kind+'-format').value,instrument:kind==='use'?$('use-instrument').value:''};
    localStorage.setItem('labro-reconcile-profile',JSON.stringify(p));profile=p;status('Profile saved locally.');
  }catch(e){status('Could not save: '+e.message);}
};
$('reconcile').onclick=()=>{
  try{
    clear();if(!sources.book||!sources.use)throw Error('Add both a booking export and an instrument log.');
    const normalized={};
    for(const kind of ['book','use']){
      const map=mapping(kind),events=kind==='use'&&$('use-layout').value==='events';
      const required=['user',...(events?['timestamp','event']:['start','end']),...(kind==='book'?['instrument']:[])];
      if(required.some(k=>map[k]<0))throw Error('Map the required '+kind+' identity and time columns.');
      normalized[kind]=E.normalize(sources[kind].table,map,{events,format:$(kind+'-format').value,source:sources[kind].name+(sources[kind].sheet?' / '+sources[kind].sheet:''),instrument:kind==='use'?$('use-instrument').value.trim():''});
    }
    issues=[...normalized.book.issues,...normalized.use.issues];
    rows=E.reconcile(normalized.book.records,normalized.use.records,policy());
    draw();status(rows.length+' review rows prepared.');
  }catch(e){status(e.message);}
};
const date=day=>new Date(day*86400000).toISOString().slice(0,10),clock=n=>new Date(n*60000).toISOString().slice(11,16);
function timeline(r){
  const all=[...r.book,...r.use],lo=Math.min(...all.map(x=>x[0])),hi=Math.max(...all.map(x=>x[1])),span=Math.max(1,hi-lo);
  return '<div class="timeline"><div class="time-labels"><span>'+clock(lo)+'</span><span>'+clock(hi)+'</span></div>'+[r.book,r.use].map((ivs,i)=>'<div class="time-track '+(i?'actual':'')+'" aria-label="'+(i?'Observed':'Booked')+' time">'+ivs.map(iv=>'<i style="left:'+((iv[0]-lo)/span*100)+'%;width:'+((iv[1]-iv[0])/span*100)+'%"></i>').join('')+'</div>').join('')+'</div>';
}
function eligible(r){return !r.flags.length||Boolean(approved[r.id]);}
function draw(){
  const held=rows.filter(r=>!eligible(r)),ready=rows.filter(eligible),labs={};
  ready.forEach(r=>{const k=r.lab+' / '+r.mode;labs[k]=(labs[k]||0)+r.amount;});
  $('results').innerHTML='<div class="review-heading"><div><h2>Review the differences</h2><p class="review-count">'+rows.length+' rows · '+held.length+' held · '+ready.length+' ready</p></div><button id="export" class="btn" '+(issues.length||!ready.length?'disabled':'')+'>Export '+ready.length+' ready rows</button></div>'+
    (issues.length?'<div class="issues" role="alert"><h3>Source records need correction</h3><p>Export is blocked. Correct these records in a copy of the source and reload it; missing times are never invented.</p><ul>'+issues.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')+
    '<div class="totals-row"><span><strong>'+usd(ready.reduce((n,r)=>n+r.amount,0))+'</strong>Ready subtotal</span><span><strong>'+usd(held.reduce((n,r)=>n+r.amount,0))+'</strong>Held estimate</span><span><strong>'+($('evidence').value==='acquisition'?'Acquisition':'Login')+'</strong>Evidence type · grey = booking, blue = observed</span></div>'+
    '<div class="review-table"><table><thead><tr><th>Researcher / instrument</th><th>Booking vs observed</th><th>Policy result</th><th>Funding / service</th><th>Review</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td><b>'+esc(r.user)+'</b><small>'+esc(r.instrument)+'<br>'+date(r.day)+'</small></td><td>'+timeline(r)+'<small>'+r.booked+' min booked / '+r.used+' min observed</small></td><td><b>'+usd(r.amount)+'</b><small>'+r.raw+' → '+r.billed+' min<br>'+usd(r.rate)+'/hour</small></td><td>'+esc(r.lab||'Unassigned lab')+'<small>'+esc(r.account||'Missing account')+'<br>'+esc(r.mode||'Missing service type')+'</small></td><td>'+
      (r.flags.length?'<div class="flag-text">'+r.flags.map(esc).join('<br>')+'</div>':'<span class="ready">Matched</span>')+
      (approved[r.id]?'<p class="ready">Reviewed: '+esc(approved[r.id])+'</p>':r.flags.length?'<input class="review-note" data-note="'+i+'" placeholder="Reason for accepting this result" aria-label="Review reason for '+esc(r.user)+'"><button class="btn ghost" data-approve="'+i+'">Accept with reason</button>':'')+
      '<details><summary>Source rows</summary><small>'+r.refs.map(esc).join('<br>')+'</small></details></td></tr>').join('')+'</tbody></table></div>'+
    '<h2>Ready totals by lab and service</h2><p class="small muted">Held rows are excluded. This is a finance review export, not an invoice submission.</p><div class="review-table"><table><tbody>'+Object.entries(labs).map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+usd(v)+'</td></tr>').join('')+'</tbody></table></div>';
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>{
    const r=rows[+b.dataset.approve],note=document.querySelector('[data-note="'+b.dataset.approve+'"]').value.trim();
    if(r.flags.some(f=>/Missing|multiple|service type|valid rate|without a matching booking/.test(f))){status('Correct the lab, account or service type in the source before releasing this row.');return;}
    if(!note){status('Enter a reason before accepting an exception.');return;}approved[r.id]=note;draw();
  });
  $('export').onclick=()=>{
    const out=[['Date','Instrument','User','Lab','Account','Service','Booked minutes','Observed minutes','Policy','Evidence','Billable minutes','Rate','Charge','Review reason','Source rows'],
    ...rows.filter(eligible).map(r=>[date(r.day),r.instrument,r.user,r.lab,r.account,r.mode,r.booked,r.used,$('basis').value,$('evidence').value,r.billed,r.rate,r.amount,approved[r.id]||'Matched',r.refs.join('; ')])];
    function cell(v){if(typeof v==='string'&&/^[=+@-]/.test(v))v="'"+v;return '"'+String(v).replace(/"/g,'""')+'"';}
    const url=URL.createObjectURL(new Blob([out.map(r=>r.map(cell).join(',')).join('\n')],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='labro-reviewed-charges.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}
$('sample').onclick=()=>{
  ++versions.book;++versions.use;clear();$('book-file').value='';$('use-file').value='';
  const book='Resource,Begin,End,Owner,Lab,PTA,Reservation type\nAnalyzer,2026-10-02 09:00:00,2026-10-02 11:00:00,Jamie Chen,Willow Lab,DEMO-01,Self-Service\nAnalyzer,2026-10-03 10:00:00,2026-10-03 11:00:00,Alex Reed,Cedar Lab,DEMO-02,Assisted\nAnalyzer,2026-10-04 14:00:00,2026-10-04 15:00:00,Morgan Lee,Willow Lab,DEMO-01,Training';
  const use='User Full Name,Timestamp,Record\nJamie Chen,2026-10-02 11:00:00,Login successful.\nJamie Chen,2026-10-02 13:00:00,Logout.\nAlex Reed,2026-10-03 10:00:00,Login successful.\nAlex Reed,2026-10-03 10:20:00,Login successful.\nAlex Reed,2026-10-03 10:48:00,Logout.';
  sources={book:{name:'Example Booked export.csv',table:C.parseCSV(book)},use:{name:'Example instrument events.csv',table:C.parseCSV(use)}};
  config('book');config('use');$('use-instrument').value='Analyzer';$('basis').value='union';$('round').value='30';$('evidence').value='login';$('aliases').value='';$('book-format').value=$('use-format').value='iso';
  $('dataset').textContent='Synthetic example · no real accounts';$('reconcile').click();
};
})();
