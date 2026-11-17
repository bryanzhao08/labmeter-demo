'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {startSimulator,validMonth}=require('./simulator.cjs'),{mapColumns}=require('./mapper.cjs');
const model=require('./model/columns.json'),evaluation=require('./model/evaluation.json');
const HEAD=['Reservation ID','Resource','Owner','Lab','Account','Start','End','Reservation type','User type','Status'];
const fields=['id','resource','user','lab','account','start','end','service','tier','status'];
const stamp=s=>{if(!/^20\d{2}-(0[1-9]|1[0-2])-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s))return NaN;const d=new Date(s.replace(' ','T')+'Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,19).replace('T',' ')===s?d.getTime():NaN};
const csv=table=>[table.head,...table.rows].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
function normalize(pages,resources,month){
 const rows=[],issues=[],seen=new Map(),evidence=[];let duplicates=0,cancelled=0;
 for(const [pageNo,page] of pages.entries()){
  const {mapping,evidence:ev}=mapColumns(model,page.headers);if(!pageNo)evidence.push(...ev);
  for(const [index,row] of page.rows.entries()){
   const ref={page:pageNo+1,row:index+1};
   if(!Array.isArray(row)||row.length!==page.headers.length||row.some(x=>typeof x!=='string'||x.length>500)){issues.push({...ref,reason:'Unexpected row shape'});continue}
   const out=fields.map(k=>mapping[k]===undefined?'':row[mapping[k]].trim()),[id,resource,user,,,start,end,,,status]=out;
   if(!id||!resource||!user||!Number.isFinite(stamp(start))||!Number.isFinite(stamp(end))||stamp(end)<=stamp(start)||!start.startsWith(month+'-')||!resources.some(r=>r.name===resource)||!['Confirmed','Cancelled'].includes(status)){issues.push({...ref,reason:'Invalid identity, instrument, date, time or status'});continue}
   if(seen.has(id)){if(seen.get(id)!==JSON.stringify(out))issues.push({...ref,reason:'Conflicting records share a reservation ID'});else duplicates++;continue}
   seen.set(id,JSON.stringify(out));if(status==='Cancelled')cancelled++;rows.push(out);
  }
 }
 return {table:{head:HEAD,rows},issues,duplicates,cancelled,mapping:evidence};
}
async function createRuntime({directory,onEvent=()=>{}}={}){
 const sim=await startSimulator(),runs=new Map();let active=null;
 if(directory){fs.mkdirSync(directory,{recursive:true,mode:0o700});for(const name of fs.readdirSync(directory).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).slice(-30)){try{const r=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));if(r.status==='running'){r.status='interrupted';r.error='Parity closed before this run finished. Start a new run.'}runs.set(r.id,r)}catch{}}}
 const save=r=>{if(!directory)return;const p=path.join(directory,r.id+'.json');fs.writeFileSync(p+'.tmp',JSON.stringify(r),{mode:0o600});fs.renameSync(p+'.tmp',p)};
 const emit=(r,tool,message,extra={})=>{r.events.push({at:new Date().toISOString(),tool,message,...extra});onEvent({id:r.id,status:r.status,event:r.events.at(-1)})};
 const summary=r=>({id:r.id,system:r.system,month:r.month,status:r.status,started:r.started,finished:r.finished,counts:r.counts,error:r.error});
 async function getJSON(r,endpoint,signal){
  const u=new URL(endpoint,sim.origin);if(u.origin!==sim.origin||!u.pathname.startsWith('/api/'+r.system+'/'))throw Error('Source requested an unexpected endpoint.');
  for(let attempt=0;attempt<3;attempt++){
   signal.throwIfAborted();const timeout=AbortSignal.timeout(5000),combined=AbortSignal.any([signal,timeout]);
   const response=await fetch(u,{signal:combined,redirect:'error'});
   if([429,502,503].includes(response.status)&&attempt<2){emit(r,'retry',`Source returned ${response.status}; retry ${attempt+1} of 2.`);await new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(signal.reason)};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve()},150*(attempt+1));signal.addEventListener('abort',stop,{once:true})});continue}
   if(!response.ok)throw Error('Scheduling source returned HTTP '+response.status+'. Try again.');
   const reader=response.body.getReader();let bytes=0,chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024)throw Error('Scheduling response exceeds 1 MB.');chunks.push(Buffer.from(value))}}finally{await reader.cancel()}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
 }
 async function execute(r,controller){
  const signal=controller.signal;
  try{
   emit(r,'plan',`Read ${r.system==='fbs'?'FBS':'iLab'} capabilities, discover equipment, pull ${r.month}, validate and stage for review.`);
   const manifest=await getJSON(r,`/api/${r.system}/manifest`,signal);
   if(manifest.mode!=='synthetic'||!manifest.readOnly)throw Error('Unexpected source capabilities.');
   emit(r,'discover_source','Practice source identified. Read-only access; no bookings or charges will be changed.');
   const {resources}=await getJSON(r,manifest.resources,signal);if(!Array.isArray(resources)||resources.length>100)throw Error('Unexpected equipment list.');
   emit(r,'list_resources',`Found ${resources.length} instruments.`);
   const pages=[],visited=new Set();let p=1;
   while(p!==null){
    signal.throwIfAborted();if(!Number.isInteger(p)||p<1||visited.has(p)||visited.size>=10)throw Error('Pagination loop or report page limit reached. No data imported.');visited.add(p);
    const payload=await getJSON(r,`${manifest.reservations}?month=${r.month}&page=${p}&scenario=${r.scenario}&run=${r.id}`,signal);
    const report=r.system==='fbs'?payload:payload.ilab_response?.reservation_report;
    if(!report||!Array.isArray(report.headers)||!Array.isArray(report.rows)||report.rows.length>1000)throw Error('Scheduling report has an unsupported shape.');
    pages.push(report);emit(r,'pull_reservations',`Read page ${p}: ${report.rows.length} source rows.`);p=report.nextPage;
   }
   if(pages.some(page=>!Number.isInteger(page.total)||page.total!==pages[0].total)||pages.reduce((n,page)=>n+page.rows.length,0)!==pages[0].total)throw Error('Report is incomplete. Source row count does not match downloaded pages.');
   const normalized=normalize(pages,resources,r.month);
   emit(r,'map_columns',`Trained local mapper identified ${normalized.mapping.filter(m=>m.confidence>=0.45).length} columns. Deterministic checks validate dates and identities.`);
   emit(r,'validate',`${normalized.table.rows.length} unique reservations; ${normalized.duplicates} duplicate removed; ${normalized.issues.length} rejected rows.`);
   const usage=await getJSON(r,`${manifest.usage}?month=${r.month}`,signal);
   if(!usage||JSON.stringify(usage.head)!==JSON.stringify(['Workstation','Username','Logon Time','Logoff Time'])||!Array.isArray(usage.rows)||usage.rows.some(row=>!Array.isArray(row)||row.length!==4||!Number.isFinite(stamp(row[2]))||!Number.isFinite(stamp(row[3]))||stamp(row[3])<=stamp(row[2])))throw Error('Usage report did not pass validation.');
   signal.throwIfAborted();
   r.result={...normalized,usage,resources,source:{system:r.system,mode:'synthetic',month:r.month,pages:pages.length,sha256:crypto.createHash('sha256').update(JSON.stringify(pages)).digest('hex')},csv:csv(normalized.table)};
   r.counts={reservations:normalized.table.rows.length,cancelled:normalized.cancelled,duplicates:normalized.duplicates,rejected:normalized.issues.length,pages:pages.length};
   r.status=normalized.issues.length?'needs_review':'ready';emit(r,'stage',normalized.issues.length?'Review rejected rows before importing.':'Schedule staged. Choose “Use in Parity” to import it.');
  }catch(e){r.status=signal.aborted?'cancelled':'failed';r.error=signal.aborted?'Run cancelled. Current schedule was kept.':String(e.message||'Source pull failed.').slice(0,300);emit(r,r.status,r.error)}
  finally{r.finished=new Date().toISOString();save(r);if(active?.id===r.id)active=null;onEvent({id:r.id,status:r.status});}
 }
 return {
  info:()=>({mode:'synthetic',systems:['fbs','ilab'],model:{type:model.type,trainingSamples:evaluation.trainingSamples,accuracy:evaluation.accuracy,heldoutSamples:evaluation.heldoutSamples,scope:evaluation.scope},runs:[...runs.values()].sort((a,b)=>b.started.localeCompare(a.started)).slice(0,20).map(summary)}),
  start(input){if(active)throw Error('An agent is already running. Wait or cancel it.');if(!input||!['fbs','ilab'].includes(input.system))throw Error('Choose FBS or iLab.');validMonth(input.month);const scenario=input.scenario||'normal';if(!['normal','retry','invalid'].includes(scenario))throw Error('Unknown practice scenario.');const r={id:crypto.randomUUID(),system:input.system,month:input.month,scenario,status:'running',started:new Date().toISOString(),events:[]};runs.set(r.id,r);while(runs.size>30){const oldest=[...runs.values()].sort((a,b)=>a.started.localeCompare(b.started))[0];runs.delete(oldest.id);if(directory&&/^[a-f0-9-]{36}$/.test(oldest.id))fs.rmSync(path.join(directory,oldest.id+'.json'),{force:true})}active={id:r.id,controller:new AbortController()};save(r);void execute(r,active.controller);return summary(r)},
  get(id){const r=runs.get(id);if(!r)throw Error('Run not found.');return structuredClone(r)},
  cancel(id){if(active?.id===id)active.controller.abort();return true},
  practiceURL(system){if(!['fbs','ilab'].includes(system))throw Error('Choose FBS or iLab.');return sim.origin+'/'+system},
  async close(){if(active)active.controller.abort();await sim.close()}
 };
}
module.exports={createRuntime,normalize,csv};
