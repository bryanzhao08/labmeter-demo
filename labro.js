/* LaBro app: schedule from the booking system, billing rules from a price sheet, month review. */
(function(root){
'use strict';
if(typeof document==='undefined')return;
const H=root.LBHelpers,R=root.LBRates,S=root.LBSchedule,E=root.LBReconcile,I=root.LBIntake,FS=root.labroFS||null;
const APP_VERSION='0.6.0',CONN=root.labroConn||null;
const {choices,detectColumns,keywordParser,validateModel,extractMachines,machineRulesFrom,policyFor,outliers,flagKind,applyRateCard,setBilling,tierKey,MODE_NAME}=H;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const plural=(n,one,many)=>n+' '+(n===1?one:many);
const key=s=>String(s||'').trim().toLowerCase();
const PALETTE=['var(--r1)','var(--r2)','var(--r3)','var(--r4)','var(--r5)','var(--r6)'];

const defaults=()=>({lab_name:'Your lab',description:'',booking_system:'FBS',basis:'union',round_minutes:30,evidence:'login',
  rates:{self:60,assisted:125,training:125},machines:[],machines_on:[],machine_rules:{},rate_card:[],tiers:[],default_tier:'internal',
  after_hours:null,price_notes:[],alert_over:'',context:'',notes:''});
let profile=null;try{const p=JSON.parse(localStorage.getItem('labro-profile'));if(p&&typeof p==='object')profile={...defaults(),...p}}catch{}
let draft=profile?structuredClone(profile):defaults();
let review=!!profile,badge='',priceSrc=null;
let res=null,sources={},logs=[],rows=null,rowIndex=new Map(),issues=[],approved={},routeToken=0;
let sched={view:'day',day:null,sel:null,hidden:new Set()},resFilter='all';
let cx={info:null,system:null,guess:null,guessText:'',apps:null,test:null,busy:false,mcp:null,loaded:false,error:''};
let folder={path:null,entries:[],busy:false,error:'',cache:new Map(),sig:'',scanned:false},sampleMode=false;

/* ---------------------------------------------------------------- rules (setup) */
function billingLabel(p){return p.evidence==='acquisition'?'Acquisition time':p.basis==='actual'?'Used only':p.basis==='booked'?'Booked only':'Booked plus used'}
function chips(k,label,selected){return `<label>${label}</label><div class="chips">${choices[k].map(v=>`<button type="button" class="chip" data-group="${k}" data-value="${esc(v)}" aria-pressed="${String(v)===String(selected)}">${esc(k==='round_minutes'?v+' min':v)}</button>`).join('')}</div>`}
function machineChips(){
  const list=draft.machines||[];
  return `<label>Machines in your lab</label><p class="hint">Select the machines you bill for.</p><div class="chips">${list.length?list.map(v=>`<button type="button" class="chip" data-machine="${esc(v)}" aria-pressed="${(draft.machines_on||[]).includes(v)}">${esc(v)}</button>`).join(''):'<span class="hint">No machines found yet. Add them below.</span>'}</div><div class="add-machine"><input id="new-machine" placeholder="Add a machine, for example Cell sorter" aria-label="Add a machine"><button type="button" class="secondary" id="add-machine">Add</button></div>`;
}
function machineRules(){
  const on=draft.machines_on||[];if(!on.length)return '';
  return `<label>Different billing rule for a machine?</label><p class="hint">Leave a machine on the lab default unless it bills differently, for example microscopes on actual time or an NMR on acquisition time.</p>${on.map((m,i)=>{
    const r=(draft.machine_rules||{})[m]||{},custom=!!(r.billing||r.round_minutes);
    return `<details class="mrule" ${custom?'open':''}><summary>${esc(m)} <span class="hint">${custom?'custom rule':'lab default'}</span></summary><div class="mrule-body"><label>Billing rule<select data-mrule="${i}" data-field="billing"><option value="">Lab default</option>${choices.billing.map(v=>`<option ${r.billing===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Round up to<select data-mrule="${i}" data-field="round_minutes"><option value="">Lab default</option>${choices.round_minutes.map(v=>`<option value="${v}" ${r.round_minutes===v?'selected':''}>${v} min</option>`).join('')}</select></label></div></details>`}).join('')}`;
}
function priceTable(){
  const items=draft.rate_card||[],tiers=(draft.tiers&&draft.tiers.length)?draft.tiers:[{key:'internal',label:'Internal'}];
  const dt=draft.default_tier||tiers[0].key;
  const modeOpts=cur=>['self','assisted','training','any'].map(m=>`<option value="${m}" ${cur===m?'selected':''}>${MODE_NAME[m]}</option>`).join('');
  const unitOpts=cur=>{const base=['hour','sample','session','day'];if(cur&&!base.includes(cur))base.push(cur);return base.map(u=>`<option value="${esc(u)}" ${(cur||'hour')===u?'selected':''}>${u==='hour'?'Per hour':'Per '+esc(u)}</option>`).join('')};
  return `<div class="pricewrap"><table class="price"><thead><tr><th>Machine</th><th>Service</th><th>Unit</th>${tiers.map(t=>`<th class="num">${esc(t.label)} ($)</th>`).join('')}<th class="num">After hours ($)</th><th></th></tr></thead><tbody>${items.map((it,i)=>{
    const ah=it.after?(it.after[dt]??it.after['*']):'';
    return `<tr class="${it.hourly===false?'muted':''}"><td><input data-rc="${i}" data-f="machine" value="${esc(it.machine)}" placeholder="All machines" aria-label="Machine"></td><td><select data-rc="${i}" data-f="mode" aria-label="Service">${modeOpts(it.mode)}</select></td><td><select data-rc="${i}" data-f="unit" aria-label="Unit">${unitOpts(it.unit)}</select></td>${tiers.map(t=>`<td class="num"><input type="number" min="0" step="0.01" data-rc="${i}" data-f="t:${esc(t.key)}" value="${esc(it.rates[t.key]??'')}" aria-label="${esc(t.label)} price"></td>`).join('')}<td class="num"><input type="number" min="0" step="0.01" data-rc="${i}" data-f="after" value="${esc(ah??'')}" aria-label="After-hours price"></td><td><button type="button" class="rm" data-rm="${i}" aria-label="Remove this price">&times;</button></td></tr>`}).join('')}</tbody></table></div>`;
}
function pricingSection(){
  const items=draft.rate_card||[];
  if(!items.length)return `<div class="form-section"><h2>Prices</h2><p class="hint">No prices were found. Go back and add a price sheet, or add the hourly prices here.</p><div class="rates">${['self','assisted','training'].map((k,i)=>`<label>${['Self-service','Assisted','Training'][i]} ($ per hour)<input type="number" min="0" step="0.01" id="rate-${k}" value="${draft.rates[k]}"></label>`).join('')}</div><div class="actions"><button type="button" class="secondary" id="add-price">Add a price row</button></div></div>`;
  const nonHourly=items.filter(i=>i.hourly===false).length,tiers=draft.tiers||[],hasAfter=items.some(i=>Object.keys(i.after||{}).length),win=draft.after_hours||{start:18,end:9,weekends:true};
  return `<div class="form-section"><h2>Prices</h2><p class="hint">LaBro read these from your price sheet. Check each row and fix anything that looks wrong.</p>${priceTable()}${nonHourly?`<p class="hint" style="margin-top:8px">${plural(nonHourly,'row is','rows are')} priced per item, not per hour. LaBro keeps ${nonHourly===1?'it':'them'} on the list but does not use ${nonHourly===1?'it':'them'} for hourly billing.</p>`:''}<div class="actions"><button type="button" class="secondary" id="add-price">Add a price row</button></div>
  ${tiers.length>1?`<label for="default-tier">Rate for users with no type in the reservation export</label><select id="default-tier" style="max-width:260px">${tiers.map(t=>`<option value="${esc(t.key)}" ${t.key===draft.default_tier?'selected':''}>${esc(t.label)}</option>`).join('')}</select><p class="hint">When the export has a user type column, LaBro uses each person's own rate.</p>`:''}
  ${hasAfter?`<label>After hours means</label><div class="field-row" style="max-width:520px"><label style="margin:0">Weekdays after<input type="number" min="0" max="23" id="ah-start" value="${win.start}"></label><label style="margin:0">and before<input type="number" min="0" max="23" id="ah-end" value="${win.end}"></label></div><label style="font-weight:400"><input type="checkbox" id="ah-weekends" ${win.weekends?'checked':''}>All day on weekends is after hours</label>${draft.after_hours&&draft.after_hours.guessed?'<p class="hint">Your sheet did not say which hours count, so these are a starting point. Change them to match your core.</p>':''}`:''}
  ${(draft.price_notes||[]).length?`<details><summary>Policy notes from your price sheet</summary><ul class="unplaced">${draft.price_notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><p class="hint">LaBro uses the rounding step and the after-hours hours. It does not apply the other notes. Cancellations and no-shows appear as sessions that need a look.</p></details>`:''}
  ${(draft.unplaced||[]).length?`<details><summary>${plural(draft.unplaced.length,'line',' lines')} we could not place</summary><ul class="unplaced">${draft.unplaced.slice(0,30).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></details>`:''}</div>`;
}
function setup(){
  if(!review){
    const ps=priceSrc;
    return `<div class="page-head"><div><h1>Billing rules</h1><p class="sub">Show LaBro how your core bills. Add your price sheet and it reads the prices, tiers and after-hours rates for you.</p></div></div>
    ${badge?`<div class="badge">${esc(badge)}</div>`:''}
    <div class="card"><h2>Price sheet</h2><p class="hint">An Excel or CSV file, or any text with your prices. It stays on this computer.</p>
    ${ps?`<div class="file-ok"><span class="tick">&#10003;</span><div><strong>${esc(ps.name)}</strong><small class="hint" style="display:block">${plural(ps.result.items.length,'price','prices')} found${ps.result.unplaced?'':''}</small></div><button type="button" class="link" id="clear-price" style="margin-left:auto">Remove</button></div>`:`<label class="drop" data-drop="price"><strong>Drop your price sheet here</strong><span>or click to choose a file (Excel, CSV or text)</span><input id="price-file" type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,.md,.pdf"></label>`}
    <label for="context">Or paste your prices and billing policy</label><textarea id="context" rows="6" maxlength="200000" placeholder="Flow cytometer: self-service $60/hr, assisted $125/hr, external $96/hr, after hours $45/hr&#10;Billed in 30-minute steps. If a lab books 2 hours and then uses 2 hours later, bill 4 hours.">${esc(draft.context||'')}</textarea>
    <div class="actions" style="margin-top:8px"><button class="link" id="sample-sheet" type="button">Use a sample price sheet</button></div></div>
    <div class="card"><h2>About your lab <span class="hint" style="font-weight:400">(optional)</span></h2><p class="hint">The machines you have and any rule that is not on a price sheet.</p><textarea id="description" rows="4" placeholder="We're the flow cytometry core. We have two analyzers, a cell sorter and a confocal. We book in FBS and bill the larger of booked and used time.">${esc(draft.description||'')}</textarea></div>
    <p id="setup-error" class="error" role="alert"></p>
    <div class="actions"><button class="primary" id="assistant">Read my pricing and rules</button>${profile?'<button class="link" id="back-review">Back to my setup</button>':''}</div>`;
  }
  return `<div class="page-head"><div><h1>Check your billing rules</h1><p class="sub">This is what LaBro understood. Change anything before saving.</p></div></div>${badge?`<div class="badge">${esc(badge)}</div>`:''}
  <div class="card"><label for="lab-name">Lab name</label><input class="name-input" id="lab-name" value="${esc(draft.lab_name)}">
  <div class="form-section">${machineChips()}${machineRules()}</div>
  ${pricingSection()}
  <div class="form-section">${chips('booking_system','Booking system',draft.booking_system)}${chips('billing','Billing rule',billingLabel(draft))}${chips('round_minutes','Round up to',draft.round_minutes)}</div>
  <div class="form-section"><label for="alert-over">Alert me about any session over <span class="hint">(optional, in dollars)</span></label><input type="number" min="0" step="1" id="alert-over" value="${esc(draft.alert_over)}" placeholder="For example 500" style="max-width:220px"><label for="notes">Anything specific about how your core bills?</label><textarea id="notes" rows="3" placeholder="Training is billed at the assisted rate. Overruns past the booking are billed.">${esc(draft.notes||'')}</textarea></div>
  <p id="setup-error" class="error" role="alert"></p><div class="actions"><button class="primary" id="save-profile">Save and open schedule</button><button class="link" id="rerun">Start over with a different price sheet</button></div></div>
  <details class="yousaid"><summary>What you gave us</summary><label for="description">About your lab</label><textarea id="description" rows="3">${esc(draft.description||'')}</textarea><label for="context">Pasted prices and policy</label><textarea id="context" rows="3" maxlength="200000">${esc(draft.context||'')}</textarea></details>`;
}
function readDraft(){
  if($('description'))draft.description=$('description').value.trim();
  if($('context'))draft.context=$('context').value.trim();
  if($('alert-over'))draft.alert_over=$('alert-over').value===''?'':Math.max(0,+$('alert-over').value||0);
  if($('notes'))draft.notes=$('notes').value.trim();
  if($('lab-name'))draft.lab_name=$('lab-name').value.trim()||'Your lab';
  if($('default-tier'))draft.default_tier=$('default-tier').value;
  if($('ah-start')){const a=Math.min(23,Math.max(0,+$('ah-start').value||0)),b=Math.min(23,Math.max(0,+$('ah-end').value||0));draft.after_hours={start:a,end:b,weekends:$('ah-weekends').checked}}
  for(const k of ['self','assisted','training']){if(!$('rate-'+k))continue;const v=$('rate-'+k).value;if(v===''||!Number.isFinite(+v)||+v<0)throw Error('Enter a non-negative hourly rate for each service.');draft.rates[k]=+v}
}
// One tab per instrument is common: a tab name that is not generic becomes the machine name.
function pricesFromSheets(sheets){
  const many=sheets.length>1,generic=/^(?:sheet\d*|rates?|pricing|prices?|price list|rate card|fees?)$/i;
  return R.merge(sheets.map(sh=>R.parseRates(sh.rows,extractMachineTerm,{section:many&&!generic.test(sh.name.trim())?sh.name.trim():''})));
}
async function readPriceFile(f){
  if(f.size>20*1024*1024)throw Error('Choose a file smaller than 20 MB.');
  if(/\.pdf$/i.test(f.name))throw Error('PDF files cannot be read yet. Copy the price table out of the PDF and paste it into the box below.');
  if(/\.xlsx?$/i.test(f.name)){
    const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true,dateNF:'yyyy-mm-dd hh:mm:ss'});
    if(!wb.SheetNames.length)throw Error('The file is empty.');
    return {name:f.name,result:pricesFromSheets(wb.SheetNames.map(n=>({name:n,rows:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''})})))};
  }
  const text=await f.text();
  if(/\.(?:csv|tsv)$/i.test(f.name)){const t=LMAuditCore.parseCSV(text);return {name:f.name,result:R.parseRates([t.head,...t.rows],extractMachineTerm)}}
  return {name:f.name,result:R.parseRates(text,extractMachineTerm)};
}
const extractMachineTerm=null;
async function loadPrice(files){
  const el=$('setup-error');
  try{readDraft()}catch{}
  try{const f=files[0];if(!f)return;priceSrc=await readPriceFile(f);if(!priceSrc.result.items.length&&!priceSrc.result.notes.length){const n=priceSrc.name;priceSrc=null;throw Error('No prices were found in '+n+'. Check that the file has a column of prices, or paste the prices as text.')}render()}
  catch(e){render();if($('setup-error'))$('setup-error').textContent=e.message}
}
async function assistant(){
  const say=m=>{const el=$('setup-error');if(el)el.textContent=m};
  try{readDraft()}catch(e){say(e.message);return}
  if(!priceSrc&&!draft.description&&!draft.context){say('Add a price sheet, paste your prices, or describe your lab.');return}
  const button=$('assistant');if(button){button.disabled=true;button.textContent='Reading your pricing…'}
  const original=structuredClone(draft),allText=[original.description,original.context].filter(Boolean).join('\n');
  let modelUsed=false;
  if(allText){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const reply=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'llama3.2:1b',stream:false,format:'json',options:{temperature:0},prompt:'Return ONLY JSON with fields lab_name (string), booking_system (Booked Scheduler, FBS, iLab, PPMS, Other), basis (union, actual, booked), round_minutes (30, 15, 1), evidence (login, acquisition), machines (array of the instrument names mentioned), notes (string). Use the given selected values unless the text clearly says otherwise. Input: '+JSON.stringify({...original,context:String(original.context||'').slice(0,4000)})}),signal:controller.signal});
      if(!reply.ok)throw Error('model unavailable');
      const payload=await reply.json(),parsed=JSON.parse(payload.response);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('invalid model response');
      draft=validateModel(parsed,original);
      const found=extractMachines(allText),text=allText.toLowerCase();
      draft.machines=H.dedupeMachines([...found,...(draft.machines||[]).filter(x=>text.includes(x.toLowerCase()))]);draft.machines_on=draft.machines.slice();
      draft.machine_rules=machineRulesFrom(allText,draft.machines_on);modelUsed=true;
    }catch{draft=keywordParser(allText,original);draft.description=original.description;draft.context=original.context;draft.notes=original.notes||''}
    finally{clearTimeout(timer)}
  }
  // Prices come from the price sheet reader, never from the language model.
  const parts=[];if(priceSrc)parts.push(priceSrc.result);
  for(const t of [original.context,original.description])if(t){const p=R.parseRates(t,extractMachineTerm);if(p.items.length||p.notes.length)parts.push(p)}
  const merged=R.merge(parts);
  draft.rate_card=[];draft.tiers=[];draft.price_notes=[];
  if(merged.items.length)applyRateCard(draft,merged);else draft.price_notes=merged.notes;
  draft.unplaced=merged.unmatched;
  const n=merged.items.filter(i=>i.hourly!==false).length;
  badge=(n?`Read ${plural(n,'hourly price','hourly prices')}`:'No prices found')+(priceSrc?` from ${priceSrc.name}`:'')+(modelUsed?' · Local model used for the description':'');
  review=true;render();
}
function syncMachines(){const names=[...new Set((draft.rate_card||[]).filter(i=>i.hourly!==false).map(i=>String(i.machine||'').trim()).filter(Boolean))];draft.machines=draft.machines||[];draft.machines_on=draft.machines_on||[];for(const n of names)if(!draft.machines.some(x=>key(x)===key(n))){draft.machines.push(n);draft.machines_on.push(n)}}

/* ---------------------------------------------------------------- reservations and the schedule */
const machineColor=name=>PALETTE[Math.max(0,S.resources(res?res.items:[]).indexOf(name))%PALETTE.length];
function setReservations(table,name){
  const r=S.readReservations(table);
  rows=null;rowIndex=new Map();issues=[];approved={};
  if(r){res={name,...r};sources.book={name,table:r.table,detect:detectColumns(r.table,'book'),canonical:true,reservationIssues:r.issues}}
  else{res=null;sources.book={name,table,detect:detectColumns(table,'book')}}
  sched={...sched,day:null,sel:null,hidden:new Set()};
}
const rowOf=it=>rows?rowIndex.get(key(it.resource)+'|'+key(it.user)+'|'+it.day):null;
const needsLook=r=>!!r&&!eligible(r);
function modeKey(service){const t=key(service);return /self/.test(t)?'self':/assist/.test(t)?'assisted':/train/.test(t)?'training':''}
function rateText(it){
  const p=policyFor(profile,it.resource),mode=modeKey(it.service),known=(profile.tiers||[]).map(t=>t.key),tier=tierKey(it.tier,known)||p.defaultTier;
  const r=p.rateFor?p.rateFor(mode,it.tier,false):Number(p.rates[mode]);
  if(!mode)return {text:'No service type on this reservation',ok:false};
  if(!Number.isFinite(r))return {text:'No price for '+(MODE_NAME[mode]||mode).toLowerCase(),ok:false};
  const a=p.afterHours&&p.rateFor?p.rateFor(mode,it.tier,true):null;
  const label=(profile.tiers||[]).find(t=>t.key===tier);
  return {text:`${money(r)} per hour${label?' · '+label.label:''}`+(a!=null&&a!==r?` · ${money(a)} after hours`:''),ok:true,policy:p};
}
function ensureDay(){if(sched.day==null){const d=S.busiestDay(res.items);sched.day=d!=null?d:res.items[0].day}}
function dayRange(dayItems){let hs=7,he=20;for(const i of dayItems){hs=Math.min(hs,Math.floor((i.start-i.day*1440)/60));he=Math.max(he,Math.ceil((i.end-i.day*1440)/60))}return [Math.max(0,hs),Math.min(24,he)]}
const hourLabel=h=>(h%12||12)+(h<12?' AM':' PM');
function afterBands(day,hs,he){
  const p=profile.after_hours,has=(profile.rate_card||[]).some(i=>Object.keys(i.after||{}).length);if(!p||!has)return [];
  const dow=S.dow(day);if(p.weekends&&(dow===0||dow===6))return [[hs*60,he*60]];
  const out=[];if(p.end*60>hs*60)out.push([hs*60,Math.min(he*60,p.end*60)]);if(p.start*60<he*60)out.push([Math.max(hs*60,p.start*60),he*60]);return out.filter(b=>b[1]>b[0]);
}
function blockHTML(it,lane,base,total){
  const r=rowOf(it),left=(it.start-base)/total*100,width=Math.max(1.4,(it.end-it.start)/total*100),sel=sched.sel===it.id;
  const flagged=!it.cancelled&&needsLook(r),color=machineColor(it.resource);
  const label=`${it.user}, ${it.resource}, ${S.fmtTime(it.start)} to ${S.fmtTime(it.end)}${it.cancelled?', cancelled':''}${flagged?', needs a look':''}`;
  let html=`<button type="button" class="blk ${it.cancelled?'cancel':''} ${flagged?'flagged':''}" style="left:${left}%;width:${width}%;top:${6+lane*52}px;height:38px;--c:${color}" data-res="${esc(it.id)}" aria-pressed="${sel}" aria-label="${esc(label)}" title="${esc(label)}"><b>${esc(it.user)}</b><span>${S.fmtTime(it.start)} – ${S.fmtTime(it.end)}</span></button>`;
  if(r&&!it.cancelled)for(const [a,b] of r.use){const l=(Math.max(a,base)-base)/total*100,w=(Math.min(b,base+total)-Math.max(a,base))/total*100;if(w>0)html+=`<i class="use" style="left:${l}%;width:${w}%;top:${6+lane*52+41}px" title="Logged use ${S.fmtTime(a)} – ${S.fmtTime(b)}"></i>`}
  return html;
}
function dayGrid(list){
  const dayItems=res.items.filter(i=>i.day===sched.day),[hs,he]=dayRange(dayItems),hours=he-hs,total=hours*60,base=sched.day*1440+hs*60;
  const bands=afterBands(sched.day,hs,he).map(([a,b])=>`<i class="band" style="left:${(a-hs*60)/total*100}%;width:${(b-a)/total*100}%"></i>`).join('');
  const unbooked=rows?rows.filter(r=>r.day===sched.day&&!r.book.length):[];
  const body=list.map(name=>{
    const its=dayItems.filter(i=>i.resource===name).sort((a,b)=>a.start-b.start),ln=S.lanes(its),extra=unbooked.filter(r=>key(r.instrument)===key(name));
    const lanesN=Math.max(1,(ln.length?Math.max(...ln)+1:0)+(extra.length?1:0)),h=lanesN*52+12;
    let blocks=its.map((it,i)=>blockHTML(it,ln[i],base,total)).join('');
    extra.forEach(r=>{const lane=lanesN-1;for(const [a,b] of r.use){blocks+=`<span class="blk flagged" style="left:${(a-base)/total*100}%;width:${(b-a)/total*100}%;top:${6+lane*52}px;height:38px;--c:var(--warn);border-left-style:dashed;background:var(--warn-soft)" title="Used without a reservation"><b>${esc(r.user)}</b><span>No reservation</span></span>`}});
    return `<div class="tl-row"><div class="tl-name"><b><i style="--c:${machineColor(name)}"></i>${esc(name)}</b><small>${its.filter(i=>!i.cancelled).length?plural(its.filter(i=>!i.cancelled).length,'reservation','reservations'):'Nothing booked'}</small></div><div class="tl-track" style="height:${h}px">${bands}${blocks}</div></div>`;
  }).join('');
  return `<div class="tl" style="--hours:${hours}"><div class="tl-head"><div class="tl-corner">Resource</div><div class="tl-hours">${Array.from({length:hours},(_,i)=>`<span>${hourLabel(hs+i)}</span>`).join('')}</div></div>${body}</div>`;
}
function weekGrid(list){
  const ws=S.weekStart(sched.day),days=Array.from({length:7},(_,i)=>ws+i);
  return `<div class="week"><div class="wk-head"><div class="tl-corner">Resource</div>${days.map(d=>`<button type="button" data-day="${d}" aria-current="${d===sched.day}">${S.fmtDay(d)}</button>`).join('')}</div>${list.map(name=>`<div class="wk-row"><div class="tl-name"><b><i style="--c:${machineColor(name)}"></i>${esc(name)}</b></div>${days.map(d=>{
    const its=res.items.filter(i=>i.resource===name&&i.day===d).sort((a,b)=>a.start-b.start),show=its.slice(0,4);
    return `<div class="wk-cell">${show.map(it=>{const r=rowOf(it);return `<button type="button" class="res-chip ${it.cancelled?'cancel':''} ${!it.cancelled&&needsLook(r)?'flagged':''}" style="--c:${machineColor(name)}" data-res="${esc(it.id)}" aria-pressed="${sched.sel===it.id}" title="${esc(it.user+' · '+S.fmtTime(it.start)+' – '+S.fmtTime(it.end))}">${S.fmtTime(it.start)} · ${esc(it.user)}</button>`}).join('')}${its.length>4?`<button type="button" class="more" data-day="${d}">+${its.length-4} more</button>`:''}</div>`}).join('')}</div>`).join('')}</div>`;
}
function dayStrip(){
  const all=res.items.filter(i=>!i.cancelled),counts=new Map();all.forEach(i=>counts.set(i.day,(counts.get(i.day)||0)+1));
  const first=Math.min(...res.items.map(i=>i.day)),last=Math.max(...res.items.map(i=>i.day)),max=Math.max(1,...counts.values());
  const out=[];for(let d=first;d<=last;d++){const n=counts.get(d)||0,heat=n===0?0:Math.min(3,Math.ceil(n/max*3));out.push(`<button type="button" data-day="${d}" data-heat="${heat}" aria-current="${d===sched.day}" title="${S.fmtDay(d)}: ${plural(n,'reservation','reservations')}"><b>${new Date(d*86400000).getUTCDate()}</b>${['S','M','T','W','T','F','S'][S.dow(d)]}</button>`)}
  return `<div class="daystrip" aria-label="Jump to a day">${out.join('')}</div>`;
}
function drawer(it){
  const r=rowOf(it),rt=rateText(it),color=machineColor(it.resource),hrs=(it.end-it.start)/60;
  const flags=r?r.flags:[];
  const billing=r?`<dl><dt>Booked</dt><dd>${(r.booked/60).toFixed(2)} h</dd><dt>Used</dt><dd>${(r.used/60).toFixed(2)} h${r.use.length?`<small class="hint" style="display:block">${r.use.map(([a,b])=>S.fmtTime(a)+' – '+S.fmtTime(b)).join(', ')}</small>`:''}</dd><dt>Hours billed</dt><dd>${(r.billed/60).toFixed(2)} h${r.afterMinutes?` <small class="hint">(${(r.afterMinutes/60).toFixed(2)} h after hours)</small>`:''}</dd><dt>Charge</dt><dd class="big">${money(r.amount)}</dd><dt>Rule</dt><dd>${esc(billingLabelFor(it))}</dd><dt>Status</dt><dd>${eligible(r)?'<span class="pill ok">Ready to bill</span>':'<span class="pill warn">Needs a look</span>'}</dd></dl>${flags.length?`<p style="margin-top:8px">${flags.map(f=>`<span class="flag k-${flagKind(f)}">${esc(f)}</span>`).join('')}</p>`:''}${!eligible(r)?`<input class="reason" id="drawer-reason" placeholder="Reason for approving (optional)" aria-label="Reason for approving"><div class="actions" style="margin-top:8px"><button class="primary" id="drawer-approve" data-row="${esc(r.id)}">Approve this charge</button></div>`:''}`
   :`<p class="hint">${rows?'No logged use or charge matches this reservation.':'Upload the instrument logs for this month to compare use with the reservation and see the charge.'}</p>${rows?'':'<div class="actions" style="margin-top:8px"><a class="secondary" href="#upload">Upload instrument logs</a></div>'}`;
  return `<aside class="drawer" aria-label="Reservation details" style="--c:${color}"><header><div><small>${esc(it.id)}</small><h2>${esc(it.user)}</h2><small>${esc([it.lab,it.account].filter(Boolean).join(' · ')||'No lab or account')}</small></div><button type="button" class="close" id="close-drawer" aria-label="Close details">&times;</button></header>
  <section><h3>Reservation</h3><dl><dt>Resource</dt><dd>${esc(it.resource)}</dd><dt>Date</dt><dd>${S.fmtDay(it.day)}</dd><dt>Time</dt><dd>${S.fmtTime(it.start)} – ${S.fmtTime(it.end)} <small class="hint">(${S.hoursText(it.end-it.start)})</small></dd><dt>Service</dt><dd>${esc(it.service||'Not set')}</dd><dt>User type</dt><dd>${esc(it.tier||'Not set')}</dd><dt>Status</dt><dd>${it.cancelled?'<span class="pill bad">Cancelled</span>':`<span class="pill">${esc(it.status)}</span>`}</dd></dl></section>
  <section><h3>Rate</h3><p>${rt.ok?esc(rt.text):`<span class="needs">${esc(rt.text)}</span>`}</p>${it.cancelled?'<p class="hint">Cancelled reservations are not billed. Check your cancellation policy if this one was late.</p>':''}</section>
  ${it.cancelled?'':`<section><h3>Use and billing</h3>${billing}</section>`}</aside>`;
}
function billingLabelFor(it){const p=policyFor(profile,it.resource);return (p.evidence==='acquisition'?'Acquisition time':p.basis==='actual'?'Used only':p.basis==='booked'?'Booked only':'Booked plus used')+', rounded up to '+p.round+' min'}
function emptySchedule(){
  if(FS&&folder.path)return `<div class="page-head"><div><h1>Schedule</h1><p class="sub">Reservations from your booking system, with what was actually used.</p></div></div>${folderCard({})}<div class="card empty"><h2>No reservation export in this folder yet</h2><p class="hint" style="max-width:56ch;margin:0 auto">Export reservations from ${esc(profile.booking_system)} into the folder above. The schedule fills in as soon as the file appears.</p><div class="curious" style="margin-top:22px;text-align:left"><strong>Just curious?</strong><span>Try it with simulated data: a made-up month from a small core.</span><button class="secondary" id="mock" type="button">Try it with simulated data</button></div></div>`;
  return `<div class="page-head"><div><h1>Schedule</h1><p class="sub">Reservations from your booking system, with what was actually used.</p></div></div>
  <div class="card empty"><h2>Import your reservations</h2><p class="hint" style="max-width:56ch;margin:0 auto">Export your reservations from ${esc(profile.booking_system)} as a CSV or Excel file and add it here. LaBro reads the export, so nothing needs to be connected.</p>
  <label class="drop" data-drop="book"><strong>Drop your reservation export here</strong><span>or click to choose a CSV or Excel file</span><input id="book-file" type="file" accept=".csv,.xlsx,.xls"></label>
  <div class="how"><span>1. Export from ${esc(profile.booking_system)}</span><span>2. Drop it here</span><span>3. See the schedule and the bill</span></div>
  <div class="curious" style="margin-top:22px;text-align:left"><strong>Just curious?</strong><span>Try it with simulated data: a made-up month from a small core.</span><button class="secondary" id="mock" type="button">Try it with simulated data</button></div></div>`;
}
function schedule(){
  if(!res){
    if(sources.book&&!res)return `<div class="page-head"><div><h1>Schedule</h1></div></div><div class="banner warn"><div><strong>${esc(sources.book.name)} was not read as a reservation export.</strong><br>LaBro needs columns for the resource, the person, and the start and end. You can still match columns for billing on the Upload page.<div class="actions" style="margin-top:8px"><a class="secondary" href="#upload">Match columns</a><label class="secondary filebtn">Choose a different file<input id="book-file" type="file" accept=".csv,.xlsx,.xls"></label></div></div></div>`;
    return emptySchedule();
  }
  ensureDay();
  const list=S.resources(res.items).filter(n=>!sched.hidden.has(n)),active=res.items.filter(i=>!i.cancelled);
  const bookedH=active.reduce((n,i)=>n+(i.end-i.start),0)/60,look=rows?rows.filter(r=>!eligible(r)).length:null;
  const first=Math.min(...res.items.map(i=>i.day)),last=Math.max(...res.items.map(i=>i.day));
  const open=sched.sel&&res.items.find(i=>i.id===sched.sel);
  const step=sched.view==='week'?7:1;
  const title=sched.view==='week'?`${S.fmtShortDay(S.weekStart(sched.day))} – ${S.fmtShortDay(S.weekStart(sched.day)+6)}`:S.fmtDay(sched.day);
  const sel=open||null;
  return `<div class="page-head"><div><h1>Schedule</h1><p class="sub">${esc(res.name)} · ${S.fmtShortDay(first)} to ${S.fmtShortDay(last)}</p></div><div class="head-actions"><label class="secondary filebtn">Replace reservations<input id="book-file" type="file" accept=".csv,.xlsx,.xls"></label><a class="primary" href="#upload">${rows?'Open results':'Upload instrument logs'}</a></div></div>
  ${res.issues.length?`<div class="banner warn"><div><strong>${plural(res.issues.length,'row','rows')} in the export could not be read.</strong><ul>${res.issues.slice(0,5).map(x=>`<li>${esc(x)}</li>`).join('')}${res.issues.length>5?`<li>and ${res.issues.length-5} more</li>`:''}</ul></div></div>`:''}
  <div class="stats"><div class="stat"><span>Reservations</span><strong>${active.length}</strong><small>${res.cancelled?plural(res.cancelled,'cancelled','cancelled')+', not billed':'None cancelled'}</small></div><div class="stat"><span>Hours booked</span><strong>${bookedH.toFixed(0)}</strong><small>${plural(S.resources(res.items).length,'resource','resources')}</small></div>${rows?`<div class="stat"><span>Ready to bill</span><strong>${money(rows.filter(eligible).reduce((n,r)=>n+r.amount,0))}</strong><small>from logged use</small></div><div class="stat"><span>Need a look</span><strong>${look}</strong><small><a href="#results">Open results</a></small></div>`:`<div class="stat"><span>Use and billing</span><strong>Not checked</strong><small>Add instrument logs</small></div>`}</div>
  <div class="toolbar"><div class="datebox"><button type="button" class="btn" data-nav="-${step}" aria-label="Previous ${sched.view}">&lsaquo;</button><h2>${esc(title)}</h2><button type="button" class="btn" data-nav="${step}" aria-label="Next ${sched.view}">&rsaquo;</button></div><div class="seg" role="group" aria-label="View"><button type="button" data-view="day" aria-pressed="${sched.view==='day'}">Day</button><button type="button" data-view="week" aria-pressed="${sched.view==='week'}">Week</button></div><div class="grow"></div><div class="mchips" role="group" aria-label="Show resources">${S.resources(res.items).map(n=>`<button type="button" class="mchip" style="--c:${machineColor(n)}" data-mtoggle="${esc(n)}" aria-pressed="${!sched.hidden.has(n)}"><i></i>${esc(n)}</button>`).join('')}</div></div>
  ${dayStrip()}
  <div class="sched-layout ${sel?'open':''}"><div class="cal">${list.length?(sched.view==='week'?weekGrid(list):dayGrid(list)):'<div class="empty"><p class="hint">Turn on at least one resource to see its reservations.</p></div>'}<div class="legend2"><span><i class="lg-use"></i>Logged use</span><span><i class="lg-flag"></i>Needs a look</span><span><i class="lg-cancel"></i>Cancelled</span>${(profile.rate_card||[]).some(i=>Object.keys(i.after||{}).length)?'<span><i class="lg-after"></i>After hours</span>':''}</div></div>${sel?drawer(sel):''}</div>`;
}

/* ---------------------------------------------------------------- upload, analysis, results */
function mappingView(kind,i){
  const s=kind==='book'?sources.book:logs[i];
  return `<p class="hint" style="margin-top:8px">Match the missing columns to continue.</p>${kind==='use'?`<label>Log layout<select data-layout="${i}"><option value="intervals" ${!s.detect.events?'selected':''}>Paired start and end</option><option value="events" ${s.detect.events?'selected':''}>Raw login and logout events</option></select></label>`:''}<div class="mapping">${H.fields[kind].map(k=>`<label>${esc(k)}<select data-map="${kind}" ${kind==='use'?`data-idx="${i}"`:''} data-field="${k}"><option value="-1">Not provided</option>${s.table.head.map((h,j)=>`<option value="${j}" ${s.detect.map[k]===j?'selected':''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div>`;
}
function bookSection(){
  const s=sources.book;
  const body=res?`<div class="file-ok"><span class="tick">&#10003;</span><div><strong>${esc(res.name)}</strong><small class="hint" style="display:block">${plural(res.items.length-res.cancelled,'reservation','reservations')}${res.cancelled?`, ${res.cancelled} cancelled and not billed`:''}</small></div><label class="link filebtn" style="margin-left:auto">Replace<input id="book-file" type="file" accept=".csv,.xlsx,.xls"></label></div>${res.issues.length?`<p class="error" style="margin-top:8px">${plural(res.issues.length,'row','rows')} could not be read: ${esc(res.issues[0])}</p>`:''}`
   :`<label class="drop" data-drop="book"><strong>Drop your reservation export here</strong><span>or click to choose a CSV or Excel file</span><input id="book-file" type="file" accept=".csv,.xlsx,.xls"></label><p class="hint" style="margin-top:8px">${s?esc(s.name)+' · '+s.table.rows.length+' rows, '+(s.detect.missing.length?'some columns need matching':'columns matched'):'No file selected'}</p>${s&&s.detect.missing.length?mappingView('book'):''}`;
  return `<section class="card"><h2>Reservations from ${esc(profile.booking_system)}</h2><p class="hint">The month to bill. This is the same file the schedule uses.</p>${body}</section>`;
}
function upload(){
  const names=res?S.resources(res.items):(profile.machines_on||[]);
  const fcard=FS?folderCard({actions:`<div class="actions"><button class="primary" id="analyze-folder" type="button" ${canAnalyze()?'':'disabled'}>Check this month</button></div>`}):'';
  return `<div class="page-head"><div><h1>Upload a month</h1><p class="sub">${FS?'Use the files LaBro found in your folder, or add files by hand.':'Add the reservations and the instrument logs for the month.'} CSV and Excel files stay on this computer.</p></div></div>
  ${fcard}${FS?'<h2 style="margin:20px 0 8px">Or add files by hand</h2>':''}<div class="sources">${bookSection()}<section class="card"><h2>Instrument logs</h2><p class="hint">Add one log per machine if your machines export different formats.</p>${logs.map((s,i)=>`<div class="logcard"><p><strong>${esc(s.name)}</strong> · ${s.table.rows.length} rows, ${s.detect.missing.length?'some columns need matching':'columns matched'}</p><label>Instrument<select data-logmachine="${i}"><option value="">The log has an instrument column</option>${[...new Set([...names,...(s.machine?[s.machine]:[])])].map(n=>`<option value="${esc(n)}" ${s.machine===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label>${s.detect.missing.length?mappingView('use',i):''}<button class="link" data-removelog="${i}">Remove</button></div>`).join('')}<label class="drop" data-drop="log"><strong>Add an instrument log</strong><span>or click to choose a CSV or Excel file</span><input id="log-file" type="file" accept=".csv,.xlsx,.xls" multiple></label></section></div>
  <p class="hint" style="margin-top:12px">If a log has no instrument column, a unique reservation for the same person and day identifies it. Unmatched entries stay unidentified.</p><p id="upload-error" class="error" role="alert"></p>
  <div class="actions"><button id="analyze" class="primary" ${canAnalyze()?'':'disabled'}>Analyze the month</button></div>
  <div class="curious"><strong>Just curious?</strong><span>Try it with simulated data: a made-up month from a small core.</span><button class="secondary" id="mock" type="button">Try it with simulated data</button></div>`;
}
function canAnalyze(){return !!(sources.book&&!sources.book.detect.missing.length&&logs.length&&logs.every(s=>!s.detect.missing.length))}
async function fileText(f){
  if(/\.xlsx?$/i.test(f.name)){const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true,dateNF:'yyyy-mm-dd hh:mm:ss'});if(!wb.SheetNames.length)throw Error('The file is empty.');return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]],{rawNumbers:false})}
  return f.text();
}
async function loadFile(kind,files){
  const errors=[];
  for(const f of files){
    try{
      if(f.size>20*1024*1024)throw Error('Choose a file smaller than 20 MB.');
      const table=LMAuditCore.parseCSV(await fileText(f));if(!table.head.length)throw Error('The file is empty.');
      if(kind==='book')setReservations(table,f.name);
      else logs.push({name:f.name,table,detect:detectColumns(table,'use'),machine:''});
    }catch(e){errors.push(f.name+': '+e.message)}
  }
  render();
  const el=$('upload-error');if(errors.length&&el)el.textContent=errors.join(' ');else if(errors.length)toast(errors.join(' '));
}
async function loadMock(target){
  try{
    const [a,b]=await Promise.all(['fbs-reservations.csv','usage-log.csv'].map(n=>fetch('data/mock/'+n).then(r=>{if(!r.ok)throw Error('Could not load the simulated files.');return r.text()})));
    setReservations(LMAuditCore.parseCSV(a),'fbs-reservations.csv (simulated)');
    const lt=LMAuditCore.parseCSV(b);logs=[{name:'usage-log.csv (simulated)',table:lt,detect:detectColumns(lt,'use'),machine:''}];
    if(target==='results'){await run();return}
    calculate();location.hash==='#schedule'?render():(location.hash='schedule');
  }catch(e){const el=$('upload-error');if(el)el.textContent=e.message;else toast(e.message)}
}
function progress(){return `<div class="page-head"><div><h1>Analyzing your month</h1><p class="sub">Checking the logs against the reservations and your billing rules.</p></div></div><div class="card"><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0"><div id="bar"></div></div><ol class="steps">${['Reading files','Matching logins to reservations','Applying your rules','Checking for exceptions'].map((s,i)=>`<li id="step-${i}"><span>${i+1}</span>${s}</li>`).join('')}</ol></div>`}
function calculate(){
  const out=root.LBMonth.check(profile,sources.book,logs);
  rows=out.rows;issues=out.issues;rowIndex=new Map(rows.map(r=>[r.id,r]));approved={};
}
async function run(){
  location.hash='progress';await new Promise(r=>setTimeout(r,220));
  try{
    for(let i=0;i<4;i++){if(i===1)calculate();await new Promise(r=>setTimeout(r,650));if(!$('step-'+i))return;$('step-'+i).classList.add('done');$('step-'+i).querySelector('span').textContent='✓';$('bar').style.width=((i+1)*25)+'%';document.querySelector('[role=progressbar]').setAttribute('aria-valuenow',i+1)}
    const held=rows.filter(r=>!eligible(r)).length;
    toast(`Analysis done: ${plural(rows.length,'session','sessions')}, ${held} ${held===1?'needs':'need'} a look`);location.hash='results';
  }catch(e){location.hash='upload';setTimeout(()=>{if($('upload-error'))$('upload-error').textContent=e.message},200)}
}
function eligible(r){return !r.flags.length||Object.prototype.hasOwnProperty.call(approved,r.id)}
function results(){
  if(!rows)return `<div class="page-head"><div><h1>Results</h1></div></div><div class="card empty"><h2>Nothing to review yet</h2><p class="hint">Analyze a month to see sessions and charges here.</p><div class="actions" style="justify-content:center"><a class="primary" href="#upload">Upload a month</a></div></div>`;
  const ready=rows.filter(eligible),held=rows.length-ready.length;
  const shown=rows.map((r,i)=>({r,i})).filter(({r})=>resFilter==='all'||(resFilter==='look'?!eligible(r):eligible(r)));
  const tab=(k,l,n)=>`<button type="button" data-filter="${k}" aria-pressed="${resFilter===k}">${l} <span class="hint">${n}</span></button>`;
  return `<div class="result-head"><div><h1>${issues.length?'Incomplete analysis':'Ready to bill'} <span class="figure">${money(ready.reduce((s,r)=>s+r.amount,0))}</span></h1><p class="sub">${issues.length?'Provisional total · ':''}${plural(ready.length,'session','sessions')} ${issues.length?'included':'ready'} · ${held} ${held===1?'session needs':'sessions need'} a look</p></div><div class="head-actions"><button id="export" class="secondary" ${!ready.length||issues.length?'disabled':''}>Export spreadsheet</button></div></div>
  ${issues.length?`<div class="banner warn" role="alert"><div><strong>Some source rows could not be read. Correct the files and analyze again before exporting.</strong><ul>${issues.slice(0,10).map(x=>`<li>${esc(x)}</li>`).join('')}${issues.length>10?`<li>and ${issues.length-10} more</li>`:''}</ul></div></div>`:''}
  <div class="tabs" role="group" aria-label="Filter sessions">${tab('all','All',rows.length)}${tab('look','Needs a look',held)}${tab('ready','Ready',ready.length)}</div>
  <p class="legend"><span class="flag k-time">Time</span><span class="flag k-who">Who pays</span><span class="flag k-unusual">Unusual</span><span class="flag k-data">Data</span></p>
  <div class="table-wrap"><table><thead><tr><th>Who</th><th>Instrument</th><th class="num">Booked</th><th class="num">Used</th><th class="num">Hours billed</th><th class="num">Charge</th><th>Status</th></tr></thead><tbody>${shown.map(({r,i})=>`<tr><td>${esc(r.user)}<small>${S.fmtDay(r.day)}${res?` · <a href="#schedule" data-goto="${r.day}" data-goto-res="${esc(r.instrument)}">View on schedule</a>`:''}</small></td><td>${esc(r.instrument)}<small>${esc(r.mode||'No service type')}${r.tier?' · '+esc(r.tier):''}</small></td><td class="num">${(r.booked/60).toFixed(2)} h</td><td class="num">${(r.used/60).toFixed(2)} h</td><td class="num">${(r.billed/60).toFixed(2)}${r.afterMinutes?`<small>${(r.afterMinutes/60).toFixed(2)} after hours</small>`:''}</td><td class="num">${money(r.amount)}<small>${money(r.rate)}/h</small></td><td>${eligible(r)?(Object.prototype.hasOwnProperty.call(approved,r.id)&&r.flags.length?'<span class="pill ok">Approved</span>':'<span class="pill ok">Ready</span>'):`<strong class="needs">Needs a look</strong><div>${r.flags.map(f=>`<span class="flag k-${flagKind(f)}">${esc(f)}</span>`).join('')}</div><div class="row-actions"><input data-note="${i}" aria-label="Optional approval reason for ${esc(r.user)}" placeholder="Reason (optional)"><button class="secondary" data-approve="${i}">Approve</button></div>`}</td></tr>`).join('')}</tbody></table></div>`;
}
function exportCSV(){
  if(!rows||issues.length||!rows.some(eligible))return;
  const iso=d=>new Date(d*86400000).toISOString().slice(0,10);
  const out=[['Date','Instrument','User','Lab','Account','Service','User type','Booked minutes','Used minutes','Policy','Evidence','Billable minutes','After-hours minutes','Rate','Charge','Reason','Source references'],...rows.filter(eligible).map(r=>[iso(r.day),r.instrument,r.user,r.lab,r.account,r.mode,r.tier,r.booked,r.used,r.policy,r.evidence,r.billed,r.afterMinutes||0,r.rate,r.amount,approved[r.id]||'Matched',r.refs.join('; ')])];
  const cell=v=>{v=String(v??'');if(/^[\s\t\r\n]*[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
  const url=URL.createObjectURL(new Blob([out.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='labro-ready-to-bill.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function toast(message){
  const t=$('toast');t.textContent=message;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,4000);
  try{const a=new AudioContext(),o=a.createOscillator(),g=a.createGain();o.frequency.value=660;g.gain.setValueAtTime(.025,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.12);o.onended=()=>a.close()}catch{}
}

/* ---------------------------------------------------------------- folder: find the exports without naming them */
const decoder=new TextDecoder('utf-8');
const dateShort=d=>S.fmtShortDay(d);
async function readEntry(file){
  const bytes=await FS.read(file.name),sheets=[];
  if(/\.xlsx?$/i.test(file.name)){
    const wb=XLSX.read(bytes,{type:'array',cellDates:true,dateNF:'yyyy-mm-dd hh:mm:ss'});
    for(const n of wb.SheetNames)sheets.push({name:n,table:LMAuditCore.parseCSV(XLSX.utils.sheet_to_csv(wb.Sheets[n],{rawNumbers:false})),rows:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''})});
  }else{const t=LMAuditCore.parseCSV(decoder.decode(bytes));sheets.push({name:'',table:t,rows:[t.head,...t.rows]})}
  let pick=null;
  for(const sh of sheets){const c=I.classify(sh.table);if(c.kind==='reservations'||c.kind==='logs'){pick={sh,c};break}if(c.kind==='prices'&&!pick)pick={sh,c}}
  if(!pick)return {...file,kind:'unknown',info:{},columns:(sheets[0]&&sheets[0].table.head)||[]};
  const e={...file,kind:pick.c.kind,info:pick.c,table:pick.sh.table,columns:pick.sh.table.head};
  if(pick.c.kind==='prices'){e.price=pricesFromSheets(sheets.map(sh=>({name:sh.name||'Sheet',rows:sh.rows})));e.info={...pick.c,items:e.price.items.length}}
  return e;
}
async function refreshFolder(){
  if(!FS)return;folder.busy=true;
  try{
    folder.path=await FS.get();
    if(!folder.path){folder.entries=[];folder.sig='';return}
    const files=await FS.scan(),entries=[];
    for(const f of files.slice(0,60)){
      const k=f.name+'|'+f.mtime+'|'+f.size;let e=folder.cache.get(k);
      if(!e){try{e=await readEntry(f)}catch(err){e={...f,kind:'error',info:{error:err.message}}}folder.cache.set(k,e)}
      entries.push({...e,include:undefined});
    }
    I.pickDefaults(entries,folder.entries);folder.entries=entries;folder.error='';
    folder.sig=entries.map(e=>e.name+e.mtime+e.size).join('|');
  }catch(e){folder.error=e.message}
  finally{folder.busy=false;folder.scanned=true}
}
// Load the chosen reservation export and logs into the app, keeping the day the person was looking at.
function applyFolder(){
  const r=folder.entries.find(e=>e.kind==='reservations'&&e.include),ls=folder.entries.filter(e=>e.kind==='logs'&&e.include);
  const keep={day:sched.day,sel:sched.sel,view:sched.view};
  if(r){setReservations(r.table,r.name);if(res&&keep.day!=null&&res.items.some(i=>i.day===keep.day)){sched.day=keep.day;sched.sel=keep.sel;sched.view=keep.view}}
  logs=ls.map(e=>({name:e.name,table:e.table,detect:detectColumns(e.table,'use'),machine:''}));
  if(r&&ls.length&&profile&&sources.book&&!sources.book.detect.missing.length&&logs.every(l=>!l.detect.missing.length))calculate();
  return {reservations:r,logs:ls};
}
function priceFromFolder(){const e=folder.entries.find(x=>x.kind==='prices'&&x.include);return e?{name:e.name,result:e.price}:null}
async function connectFolder(){
  if(!FS)return;
  const before=folder.path;await FS.pick();await refreshFolder();
  if(profile&&folder.path)applyFolder();
  if(folder.path&&folder.path!==before)toast('Folder connected');
  if(CONN){try{cx.mcp=await CONN.mcp()}catch{}}
  render(true);
}
let folderTimer=null;
function watchFolder(){
  if(!FS)return;
  FS.onChange(()=>{clearTimeout(folderTimer);folderTimer=setTimeout(async()=>{
    const old=folder.sig;await refreshFolder();if(folder.sig===old)return;
    if(profile&&folder.entries.length){const got=applyFolder();if(got.reservations||got.logs.length)toast('Updated from your folder');}
    if(!document.querySelector('input:focus,textarea:focus,select:focus'))render(true);
  },400)});
}
function folderEntryRow(e,i){
  const info=e.info||{},label=I.KIND_LABEL[e.kind]||e.kind;
  const detail=e.kind==='reservations'?`${plural(info.rows,'reservation','reservations')}, ${dateShort(info.first)} to ${dateShort(info.last)}${info.cancelled?`, ${info.cancelled} cancelled`:''}`
    :e.kind==='logs'?`${plural(info.rows,'row','rows')}${info.first!=null?', '+dateShort(info.first)+' to '+dateShort(info.last):''}, ${info.layout==='events'?'login and logout events':'start and end times'}`
    :e.kind==='prices'?`${plural(info.items||0,'price','prices')}`:e.kind==='error'?esc(info.error||''):'We could not tell what this file is';
  const usable=['reservations','logs','prices'].includes(e.kind);
  return `<li class="frow ${usable?'':'dim'}"><label><input type="checkbox" data-inc="${i}" ${e.include?'checked':''} ${usable?'':'disabled'} aria-label="Use ${esc(e.name)}"><span class="fname">${esc(e.name)}</span></label><span class="pill ${usable?(e.kind==='reservations'?'ok':''):'warn'}">${esc(label)}</span><span class="hint">${detail}</span></li>`;
}
function folderCard(opts){
  if(!FS)return '';
  const when=folder.entries.length?'':'';
  if(!folder.path)return `<section class="card"><h2>Connect a folder</h2><p class="hint">Choose the folder where you save exports from ${esc((profile&&profile.booking_system)||'your booking system')}. LaBro reads it, never changes it, and picks up new files on its own.</p><div class="actions"><button class="primary" id="pick-folder" type="button">Choose a folder</button></div></section>`;
  const list=folder.entries;
  return `<section class="card"><div class="page-head" style="margin:0 0 6px"><div><h2>Your folder</h2><p class="hint pathline" title="${esc(folder.path)}">${esc(folder.path)}</p></div><div class="head-actions"><button class="secondary" id="rescan" type="button">${folder.busy?'Checking…':'Check again'}</button><button class="secondary" id="pick-folder" type="button">Change folder</button></div></div>
  ${folder.error?`<p class="error">${esc(folder.error)}</p>`:''}
  ${list.length?`<ul class="flist">${list.map(folderEntryRow).join('')}</ul><p class="hint" style="margin-top:8px">LaBro chose the newest reservation export and price sheet, and the logs that cover the same dates. Tick or untick to change that.</p>`:`<p class="hint" style="margin:10px 0">${folder.scanned?'No spreadsheets or text files were found in this folder yet. Export reservations from your booking system into it and they appear here.':'Looking…'}</p>`}
  ${opts&&opts.actions?opts.actions:''}</section>`;
}
function startPage(){
  const hasFolder=!!FS,list=folder.entries,priceFound=list.some(e=>e.kind==='prices'),resvFound=list.some(e=>e.kind==='reservations');
  const next=hasFolder&&folder.path?`<div class="actions"><button class="primary" id="start-continue" type="button">${priceFound?'Read my pricing and continue':'Continue'}</button>${!priceFound?'<span class="hint">No price sheet was found. You can add one on the next screen.</span>':''}</div>`:'';
  return `<div class="page-head"><div><h1>Welcome to LaBro</h1><p class="sub">LaBro checks your core's month against its bookings. It reads the exports your booking system already saves, compares them with the instrument logs, and shows what is ready to bill and what needs a look.</p></div></div>
  <div class="card"><ol class="how-list"><li><strong>Point LaBro at a folder.</strong> The one where you save exports from ${hasFolder?'your booking system (for example FBS)':'FBS, iLab or your booking system'}.</li><li><strong>It finds your files.</strong> Reservations, instrument usage logs and your price sheet, even if the files have odd names.</li><li><strong>Check the pricing, then look at the month.</strong> You see the schedule, the charges, and anything that needs your approval.</li></ol></div>
  ${hasFolder?folderCard({actions:next}):`<section class="card"><h2>Add your files</h2><p class="hint">This version works with files you add by hand. The desktop app can also watch a folder.</p><div class="actions"><a class="primary" href="#setup">Add my price sheet</a></div></section>`}
  <div class="curious"><strong>Just curious?</strong><span>Try it with simulated data: a made-up month from a small core, with a sample price sheet. Nothing is saved.</span><button class="secondary" id="sample-start" type="button">Try it with simulated data</button></div>
  ${hasFolder&&!folder.path?'<p class="hint" style="margin-top:14px">Prefer to type your rules or add files yourself? <a href="#setup">Set up by hand</a>.</p>':''}
  ${hasFolder&&folder.path&&!priceFound&&!resvFound&&folder.scanned?'<p class="hint" style="margin-top:14px">Nothing recognisable yet. Save a reservation export, usage log or price sheet into the folder and this page updates.</p>':''}`;
}
// A throwaway profile built from the sample price sheet, so the app can be tried before any setup.
async function useSample(){
  const t=LMAuditCore.parseCSV(await fetch('data/mock/price-sheet.csv').then(r=>r.text()));
  const d=defaults();d.lab_name='Simulated core';d.booking_system='FBS';applyRateCard(d,R.parseRates([t.head,...t.rows],extractMachineTerm));
  profile={...defaults(),...d};draft=structuredClone(profile);sampleMode=true;
}

/* ---------------------------------------------------------------- connections: which system, and how LaBro reaches it */
const ILAB_REGIONS=[['https://api.ilabsolutions.com','United States and general'],['https://api-eu.ilabsolutions.com','Europe'],['https://au-api.ilab.agilent.com','Australia'],['https://stanford-api.ilabsolutions.com','Stanford']];
const SYS_GUESS={FBS:'fbs',iLab:'ilab',PPMS:'ppms','Booked Scheduler':'booked'};
async function loadConnections(){
  if(CONN){try{cx.info=await CONN.get();cx.mcp=await CONN.mcp()}catch(e){cx.error=e.message}}
  if(!cx.system)cx.system=(cx.info&&cx.info.system)||SYS_GUESS[profile&&profile.booking_system]||'fbs';
  cx.loaded=true;
}
function systemCard(){
  const list=Object.entries(I.SYSTEMS),g=cx.guess;
  return `<section class="card"><h2>Find my booking system</h2><p class="hint">Paste the web address you open to book an instrument. LaBro reads the address only; it does not open the page or sign in.</p>
  <div class="add-machine" style="max-width:640px"><input id="sys-url" placeholder="For example usc.fbs.io or my.ilabsolutions.com/…" value="${esc(cx.guessText)}" aria-label="Booking system web address"><button class="primary" id="sys-find" type="button">Find it</button>${CONN?'<button class="secondary" id="sys-apps" type="button">Look on this computer</button>':''}</div>
  ${g===false?'<p class="hint" style="margin-top:10px">That address does not match a booking system LaBro knows. Pick yours below.</p>':g?`<p style="margin-top:10px"><span class="pill ok">Found</span> This is <strong>${esc(g.label)}</strong> by ${esc(g.maker)}.</p>`:''}
  ${cx.apps?`<p class="hint" style="margin-top:10px">${cx.apps.length?'Installed on this computer: '+cx.apps.map(a=>`<strong>${esc(a.name)}</strong> (${esc(I.SYSTEMS[a.system].label)})`).join(', ')+'.':'No booking-system software is installed on this computer. That is normal: most cores use these systems in a web browser.'}</p>`:''}
  <label>My core uses</label><div class="chips">${list.map(([k,v])=>`<button type="button" class="chip" data-system="${k}" aria-pressed="${cx.system===k}">${esc(v.label)}</button>`).join('')}</div></section>`;
}
function folderStatus(){
  if(!FS)return '<p class="hint">Folder reading works in the desktop app. In the browser, add files on the Upload page.</p>';
  return folder.path?`<div class="file-ok"><span class="tick">&#10003;</span><div><strong>Folder connected</strong><small class="hint pathline" style="display:block" title="${esc(folder.path)}">${esc(folder.path)}</small></div><button class="link" id="pick-folder" type="button" style="margin-left:auto">Change</button></div>`
    :`<div class="actions" style="margin-top:10px"><button class="primary" id="pick-folder" type="button">Choose the exports folder</button></div>`;
}
function ilabCard(){
  const i=cx.info||{},saved=i.system==='ilab',t=cx.test;
  if(!CONN)return `<section class="card"><h2>iLab</h2><p class="hint">Connecting with an iLab API token works in the desktop app, where the token can be stored encrypted. In the browser, export from iLab and add the files on the Upload page.</p></section>`;
  return `<section class="card"><h2>Connect to iLab with an API token</h2><p class="hint">In iLab, open your core's Administration tab and the API Clients panel. Add a client, choose Grant Token, and copy the token. Your institution has to have API access switched on.</p>
  <div class="field-row" style="max-width:720px"><label>Region<select id="ilab-base">${ILAB_REGIONS.map(([u,l])=>`<option value="${u}" ${saved&&i.base===u?'selected':''}>${l}</option>`).join('')}</select></label><label>Core ID<input id="ilab-core" inputmode="numeric" placeholder="For example 5582" value="${esc(saved?i.coreId:(cx.guess&&cx.guess.coreId)||'')}"></label></div>
  <p class="hint" style="margin-top:6px">Enter the token in a separate secure window. It is encrypted with this computer's keychain and sent only to iLab${i.canStore===false?'. This computer has no keychain, so the token is kept only until you close LaBro':''}.</p>
  <p id="conn-error" class="error" role="alert">${esc(cx.error)}</p>
  <div class="actions"><button class="primary" id="ilab-save" type="button" ${cx.busy?'disabled':''}>${cx.busy?'Testing…':'Save and test'}</button>${saved?'<button class="link" id="conn-forget" type="button">Remove this connection</button>':''}</div>
  ${t?(t.ok?`<div class="banner" style="margin:14px 0 0;border-left-color:var(--ok)"><div><strong>Connected.</strong> iLab lists ${plural(t.count,'piece','pieces')} of equipment for this core.${t.equipment.length?`<div class="chips">${t.equipment.slice(0,24).map(n=>`<span class="pill">${esc(n)}</span>`).join('')}</div><div class="actions" style="margin-top:10px"><button class="secondary" id="ilab-machines" type="button">Use these as my machines</button></div>`:''}</div></div>`:`<div class="banner warn" style="margin:14px 0 0"><div><strong>Not connected.</strong> ${esc(t.message)}</div></div>`):''}
  <div class="form-section"><h3>Reservations and usage</h3><p class="hint">${ILAB_RESERVATIONS_NOTE}</p>${folderStatus()}</div></section>`;
}
const ILAB_RESERVATIONS_NOTE='The token confirms the connection and brings in your equipment list. iLab\'s API manual (June 2025) covers equipment, services, prices and service requests, but not equipment reservations. For the month\'s reservations and usage, export the reports from iLab into your folder; LaBro picks them up from there.';
function fbsCard(){
  return `<section class="card"><h2>Connect to FBS through its exports</h2><p class="hint">FBS runs in the browser, and Priority Software does not publish documentation for its web service, so LaBro reads the files FBS lets you download.</p>
  <ol class="how-list" style="margin-top:12px"><li>In FBS, download your reservations for the month as Excel or CSV.</li><li>Save the file in one folder. Put your instrument usage logs and price sheet there too.</li><li>LaBro reads the folder, works out which file is which, and updates when a new file arrives.</li></ol>${folderStatus()}
  <p class="hint" style="margin-top:12px">If your FBS administrator can give you API details, send us the test report from the sidebar and say so. A direct FBS connection can be added once those details exist.</p></section>`;
}
function otherCard(){
  const v=I.SYSTEMS[cx.system]||{label:'your booking system'};
  return `<section class="card"><h2>Connect to ${esc(v.label)} through its exports</h2><p class="hint">Download the month's reservations from ${esc(v.label)} as Excel or CSV into one folder, along with your usage logs and price sheet. LaBro works out which file is which.</p>${folderStatus()}</section>`;
}
function mcpCard(){
  const m=cx.mcp,cfg=m&&m.available?JSON.stringify({mcpServers:{labro:{command:m.command,args:m.args,env:m.env}}},null,2):'';
  return `<section class="card"><h2>Let an AI agent run LaBro</h2><p class="hint">LaBro includes an MCP server, the standard way for an AI agent to use a tool. An agent such as Claude Desktop can find your exports, read the price sheet and run the month check. By default it receives counts and totals, not names or account codes.</p>
  ${cfg?`<label for="mcp-config">Add this to your agent's MCP settings</label><textarea id="mcp-config" rows="9" readonly spellcheck="false" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">${esc(cfg)}</textarea><div class="actions" style="margin-top:8px"><button class="secondary" id="mcp-copy" type="button">Copy settings</button>${m.folder?'':'<span class="hint">Connect a folder first so the settings point at it.</span>'}</div>`:`<p class="hint" style="margin-top:8px">${CONN?'The MCP server is not included in this build.':'Available in the desktop app.'}</p>`}</section>`;
}
function connections(){
  if(!cx.loaded){loadConnections().then(()=>{if(location.hash==='#connect')render(true)});return `<div class="page-head"><div><h1>Connections</h1></div></div><div class="card"><p class="hint">Loading…</p></div>`}
  const sys=cx.system;
  return `<div class="page-head"><div><h1>Connections</h1><p class="sub">Tell LaBro which booking system your core uses and how to reach it.</p></div></div>
  ${systemCard()}${sys==='ilab'?ilabCard():sys==='fbs'?fbsCard():otherCard()}${mcpCard()}`;
}
const SYSTEM_TO_PROFILE={fbs:'FBS',ilab:'iLab',ppms:'PPMS',booked:'Booked Scheduler'};
function chooseSystem(k){cx.system=k;cx.test=null;cx.error='';if(profile){profile.booking_system=SYSTEM_TO_PROFILE[k]||'Other';draft.booking_system=profile.booking_system;try{localStorage.setItem('labro-profile',JSON.stringify(profile))}catch{}}}

/* ---------------------------------------------------------------- test report (counts and column names only) */
function reportData(){
  const entries=folder.entries||[];
  const flags={};if(rows)rows.forEach(r=>r.flags.forEach(f=>flags[f]=(flags[f]||0)+1));
  return {version:APP_VERSION,platform:(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||'unknown',date:new Date().toISOString().slice(0,10),
    folderConnected:!!folder.path,
    files:entries.map(e=>({kind:e.kind,include:!!e.include,rows:e.info&&(e.info.rows??e.info.items),columns:e.columns,layout:e.info&&e.info.layout,unread:e.info&&e.info.unread})),
    reservations:res?{count:res.items.length-res.cancelled,cancelled:res.cancelled,unread:res.issues.length,columns:sources.book&&sources.book.table?folder.entries.find(e=>e.kind==='reservations'&&e.include)?.columns:undefined,issues:res.issues}:null,
    logs:logs.map(l=>({layout:l.detect.events?'events':'intervals',rows:l.table.rows.length,missing:l.detect.missing,columns:l.table.head})),
    prices:profile&&(profile.rate_card||[]).length?{items:profile.rate_card.length,tiers:(profile.tiers||[]).map(t=>t.label),afterHours:(profile.rate_card||[]).some(i=>Object.keys(i.after||{}).length),unplaced:(draft.unplaced||[]).length}:null,
    analysis:rows?{sessions:rows.length,ready:rows.filter(eligible).length,needLook:rows.filter(r=>!eligible(r)).length,unreadable:issues.length,flags}:null};
}
async function copyReport(){
  const text=I.buildReport(reportData());
  try{await navigator.clipboard.writeText(text);toast('Test report copied. It has counts only; source labels are omitted.')}
  catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Test report copied. It has counts only; source labels are omitted.')}catch{toast('Could not copy the report.')}ta.remove()}
}

/* ---------------------------------------------------------------- routing and events */
const TITLES={connect:'Connections',start:'Welcome',schedule:'Schedule',upload:'Upload a month',progress:'Upload a month',results:'Results',setup:'Billing rules'};
function render(keep){
  let route=location.hash.slice(1)||(profile?'schedule':'start');
  if(route==='dashboard')route='schedule';
  if(!profile&&route!=='setup'&&route!=='start'&&route!=='connect'){location.hash='start';return}
  const vp=$('viewport'),top=keep?vp.scrollTop:0,oldCal=document.querySelector('.cal'),sl=keep&&oldCal?oldCal.scrollLeft:0;
  $('screen').innerHTML=route==='start'?startPage():route==='connect'?connections():route==='setup'?setup():route==='schedule'?schedule():route==='upload'?upload():route==='progress'?progress():route==='results'?results():schedule();
  $('lab-title').textContent=(profile?.lab_name||'Your lab')+(sampleMode?' (simulated)':'');$('page-title').textContent=TITLES[route]||'';
  document.querySelectorAll('#sidebar nav a').forEach(a=>{if(a.hash==='#'+(route==='progress'?'upload':route))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  if(keep){vp.scrollTop=top;const c=document.querySelector('.cal');if(c)c.scrollLeft=sl}
  bind();
}
const on=(sel,fn)=>document.querySelectorAll(sel).forEach(fn);
function bindDrop(kind,handler){
  const input=$(kind+'-file'),drop=document.querySelector(`[data-drop="${kind}"]`);
  if(input)input.onchange=()=>{handler(Array.from(input.files));input.value=''};
  if(drop){drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};drop.ondragleave=()=>drop.classList.remove('over');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');handler(Array.from(e.dataTransfer.files))}}
}
function bind(){
  /* folder */
  if($('pick-folder'))$('pick-folder').onclick=connectFolder;
  if($('rescan'))$('rescan').onclick=async()=>{await refreshFolder();if(profile)applyFolder();render(true)};
  on('[data-inc]',el=>el.onchange=()=>{const e=folder.entries[+el.dataset.inc];e.include=el.checked;if(el.checked&&(e.kind==='reservations'||e.kind==='prices'))folder.entries.forEach(o=>{if(o!==e&&o.kind===e.kind)o.include=false});if(profile)applyFolder();render(true)});
  if($('start-continue'))$('start-continue').onclick=async()=>{const pr=priceFromFolder();draft=defaults();priceSrc=pr;review=false;location.hash='setup';if(pr){await new Promise(r=>setTimeout(r,200));await assistant()}};
  if($('sample-start'))$('sample-start').onclick=async()=>{try{await useSample();await loadMock('schedule')}catch(e){toast(e.message)}};
  on('[data-report]',b=>b.onclick=copyReport);
  /* connections */
  if($('sys-find'))$('sys-find').onclick=()=>{cx.guessText=$('sys-url').value.trim();const g=I.detectSystem(cx.guessText);cx.guess=g||false;if(g)chooseSystem(g.system);render(true)};
  if($('sys-url'))$('sys-url').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('sys-find').click()}};
  if($('sys-apps'))$('sys-apps').onclick=async()=>{cx.guessText=$('sys-url').value.trim();cx.apps=await CONN.apps();if(cx.apps.length)chooseSystem(cx.apps[0].system);render(true)};
  on('[data-system]',b=>b.onclick=()=>{if($('sys-url'))cx.guessText=$('sys-url').value.trim();chooseSystem(b.dataset.system);render(true)});
  if($('ilab-save'))$('ilab-save').onclick=async()=>{
    const d={system:'ilab',base:$('ilab-base').value,coreId:$('ilab-core').value.trim()};
    if(!d.coreId){$('conn-error').textContent='Enter your core ID. It is the number in your iLab web address.';return}
    cx.busy=true;cx.error='';cx.test=null;render(true);
    try{const result=await CONN.save(d);if(result.saved){cx.info=result.info;cx.test=await CONN.test()}}catch(e){cx.error=String(e.message||e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')}
    cx.busy=false;render(true);
  };
  if($('conn-forget'))$('conn-forget').onclick=async()=>{cx.info=await CONN.forget();cx.test=null;cx.error='';toast('Connection removed');render(true)};
  if($('ilab-machines'))$('ilab-machines').onclick=()=>{
    const names=(cx.test&&cx.test.equipment)||[];if(!names.length)return;
    const target=profile||draft;target.machines=H.dedupeMachines([...(target.machines||[]),...names]);target.machines_on=[...new Set([...(target.machines_on||[]),...names.filter(n=>target.machines.includes(n))])];
    if(profile){draft=structuredClone(profile);try{localStorage.setItem('labro-profile',JSON.stringify(profile))}catch{}}
    toast(plural(names.length,'machine','machines')+' added to your billing rules');
  };
  if($('mcp-copy'))$('mcp-copy').onclick=async()=>{const t=$('mcp-config').value;try{await navigator.clipboard.writeText(t)}catch{$('mcp-config').select();try{document.execCommand('copy')}catch{}}toast('MCP settings copied')};
  /* setup */
  on('[data-group]',b=>b.onclick=()=>{try{readDraft()}catch(e){$('setup-error').textContent=e.message;return}const k=b.dataset.group,v=b.dataset.value;if(k==='billing')setBilling(draft,v);else draft[k]=k==='round_minutes'?+v:v;render(true)});
  if($('assistant'))$('assistant').onclick=assistant;
  if($('rerun'))$('rerun').onclick=()=>{try{readDraft()}catch{}review=false;render()};
  if($('back-review'))$('back-review').onclick=()=>{review=true;render()};
  if($('clear-price'))$('clear-price').onclick=()=>{try{readDraft()}catch{}priceSrc=null;render()};
  if($('sample-sheet'))$('sample-sheet').onclick=async()=>{try{readDraft()}catch{}try{const t=LMAuditCore.parseCSV(await fetch('data/mock/price-sheet.csv').then(r=>r.text()));priceSrc={name:'sample-price-sheet.csv',result:R.parseRates([t.head,...t.rows],extractMachineTerm)};render()}catch(e){$('setup-error').textContent='Could not load the sample.'}};
  bindDrop('price',loadPrice);
  on('[data-machine]',b=>b.onclick=()=>{try{readDraft()}catch(e){$('setup-error').textContent=e.message;return}const v=b.dataset.machine,list=draft.machines_on||[];draft.machines_on=list.includes(v)?list.filter(x=>x!==v):[...list,v];render(true)});
  const addMachine=()=>{const el=$('new-machine'),v=el.value.trim().slice(0,60);if(!v)return;try{readDraft()}catch(e){$('setup-error').textContent=e.message;return}draft.machines=draft.machines||[];if(!draft.machines.some(x=>key(x)===key(v))){draft.machines.push(v);draft.machines_on=[...(draft.machines_on||[]),v]}render(true);setTimeout(()=>$('new-machine')&&$('new-machine').focus(),0)};
  if($('add-machine')){$('add-machine').onclick=addMachine;$('new-machine').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addMachine()}}}
  on('[data-rc]',el=>el.onchange=()=>{
    const it=draft.rate_card[+el.dataset.rc],f=el.dataset.f,v=el.value;if(!it)return;
    if(f==='machine'){it.machine=v.trim();syncMachines()}
    else if(f==='mode')it.mode=v;
    else if(f==='unit'){it.unit=v;it.hourly=v==='hour'}
    else if(f==='after'){it.after=it.after||{};const k=draft.default_tier||'internal';delete it.after['*'];if(v===''||!Number.isFinite(+v)||+v<0)delete it.after[k];else it.after[k]=+v}
    else if(f.startsWith('t:')){const k=f.slice(2);if(v===''||!Number.isFinite(+v)||+v<0)delete it.rates[k];else it.rates[k]=+v}
    if(f==='unit'||f==='machine'){try{readDraft()}catch{}render(true)}
  });
  on('[data-rm]',b=>b.onclick=()=>{try{readDraft()}catch{}draft.rate_card.splice(+b.dataset.rm,1);render(true)});
  if($('add-price'))$('add-price').onclick=()=>{try{readDraft()}catch(e){$('setup-error').textContent=e.message;return}draft.rate_card=draft.rate_card||[];if(!(draft.tiers||[]).length)draft.tiers=[{key:'internal',label:'Internal'}];draft.rate_card.push({machine:'',mode:'self',unit:'hour',hourly:true,rates:{},after:{},line:''});render(true)};
  if($('save-profile'))$('save-profile').onclick=()=>{try{readDraft();syncMachines();profile={...defaults(),...structuredClone(draft)};delete profile.unplaced;localStorage.setItem('labro-profile',JSON.stringify(profile));if(CONN)CONN.saveRules(JSON.stringify(profile)).then(()=>CONN.mcp()).then(m=>{cx.mcp=m}).catch(()=>{});review=true;rows=null;rowIndex=new Map();sampleMode=false;if(FS&&folder.entries.length)applyFolder();location.hash='schedule'}catch(e){$('setup-error').textContent=e.message}};
  on('[data-mrule]',el=>el.onchange=()=>{const name=(draft.machines_on||[])[+el.dataset.mrule];if(!name)return;draft.machine_rules=draft.machine_rules||{};const rule=draft.machine_rules[name]||{},field=el.dataset.field,value=el.value;if(value==='')delete rule[field];else rule[field]=field==='round_minutes'?+value:value;if(Object.keys(rule).length)draft.machine_rules[name]=rule;else delete draft.machine_rules[name]});
  /* schedule */
  on('[data-res]',b=>b.onclick=()=>{sched.sel=sched.sel===b.dataset.res?null:b.dataset.res;render(true)});
  on('[data-day]',b=>b.onclick=()=>{sched.day=+b.dataset.day;if(b.classList.contains('more'))sched.view='day';render(true)});
  on('[data-nav]',b=>b.onclick=()=>{sched.day+=+b.dataset.nav;render(true)});
  on('[data-view]',b=>b.onclick=()=>{sched.view=b.dataset.view;render(true)});
  on('[data-mtoggle]',b=>b.onclick=()=>{const n=b.dataset.mtoggle;sched.hidden.has(n)?sched.hidden.delete(n):sched.hidden.add(n);render(true)});
  if($('close-drawer'))$('close-drawer').onclick=()=>{sched.sel=null;render(true)};
  if($('drawer-approve'))$('drawer-approve').onclick=()=>{approved[$('drawer-approve').dataset.row]=($('drawer-reason').value||'').trim();render(true)};
  on('[data-goto]',a=>a.onclick=()=>{sched.day=+a.dataset.goto;sched.view='day';const r=res.items.find(i=>i.day===sched.day&&key(i.resource)===key(a.dataset.gotoRes));sched.sel=r?r.id:null});
  /* upload and results */
  if($('mock'))$('mock').onclick=()=>loadMock(location.hash==='#upload'?'results':'schedule');
  if($('analyze'))$('analyze').onclick=run;if($('analyze-folder'))$('analyze-folder').onclick=run;
  if($('export'))$('export').onclick=exportCSV;
  on('[data-filter]',b=>b.onclick=()=>{resFilter=b.dataset.filter;render(true)});
  on('[data-approve]',b=>b.onclick=()=>{approved[rows[+b.dataset.approve].id]=document.querySelector(`[data-note="${b.dataset.approve}"]`).value.trim();render(true)});
  bindDrop('book',files=>loadFile('book',files.slice(0,1)));bindDrop('log',files=>loadFile('log',files));
  on('[data-removelog]',el=>el.onclick=()=>{logs.splice(+el.dataset.removelog,1);render(true)});
  on('[data-logmachine]',el=>el.onchange=()=>{logs[+el.dataset.logmachine].machine=el.value});
  on('[data-layout]',el=>el.onchange=()=>{const d=logs[+el.dataset.layout].detect;d.events=el.value==='events';d.missing=['user',...(d.events?['timestamp','event']:['start','end'])].filter(k=>d.map[k]<0);$('analyze').disabled=!canAnalyze()});
  on('[data-map]',el=>el.onchange=()=>{const kind=el.dataset.map,d=(kind==='book'?sources.book:logs[+el.dataset.idx]).detect;d.map[el.dataset.field]=+el.value;d.missing=['user',...(d.events?['timestamp','event']:['start','end']),...(kind==='book'?['instrument']:[])].filter(k=>d.map[k]<0);$('analyze').disabled=!canAnalyze();if(kind==='book'&&el.dataset.field==='instrument')render(true)});
}
window.addEventListener('hashchange',()=>{const token=++routeToken;$('screen').classList.add('changing');setTimeout(()=>{if(token!==routeToken)return;$('viewport').scrollTop=0;render();$('screen').classList.remove('changing')},140)});
if(!location.hash)location.hash=profile?'schedule':'start';else render();
if(FS){refreshFolder().then(()=>{if(profile&&folder.entries.length){const got=applyFolder();if(got.reservations&&!location.hash.match(/#(setup|progress)/))render(true);return}if(!location.hash.match(/#(setup|progress)/))render(true)});watchFolder()}
})(typeof window!=='undefined'?window:globalThis);
