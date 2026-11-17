'use strict';
const http=require('node:http');
const SYSTEMS=['fbs','ilab'];
function validMonth(m){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))throw Error('Choose a month in YYYY-MM format.');return m}
const resources=[{id:'scope-1',name:'Confocal microscope'},{id:'flow-1',name:'Flow cytometer'},{id:'spec-1',name:'Mass spectrometer'}];
const headers={fbs:['Reservation ID','Resource name','Reserved by','Lab name','Billing account','Start date time','End date time','Service type','User type','Reservation status'],ilab:['Booking ID','Equipment name','User full name','Research lab','Account code','Start timestamp','End timestamp','Service type','Rate tier','Event status']};
function records(system,month,scenario='normal'){
 validMonth(month);const rows=[];
 for(let i=0;i<24;i++){const day=String(2+Math.floor(i/3)).padStart(2,'0'),hour=9+(i%3)*2;
 rows.push([`${system}-${i+1}`,resources[i%3].name,i===0?'John':'Researcher '+String(i+1).padStart(2,'0'),i===0?'Imaging Lab':'Sample Lab '+(i%4+1),'DEMO-'+(100+i%4),`${month}-${day} ${String(hour).padStart(2,'0')}:00:00`,`${month}-${day} ${hour+2}:00:00`,'Self-service','Internal',i===7?'Cancelled':'Confirmed']);}
 rows.push([...rows[0]]); // Duplicate across pages exercises idempotency.
 if(scenario==='invalid')rows.push([`${system}-bad`,'Confocal microscope','Researcher 25','Sample Lab','DEMO-100',`${month}-03 14:00:00`,`${month}-03 12:00:00`,'Self-service','Internal','Confirmed']);
 return rows;
}
function usage(month){return {head:['Workstation','Username','Logon Time','Logoff Time'],rows:records('fbs',month).slice(0,24).filter((r,i)=>i!==7).map((r,i)=>[r[1],r[2],r[5],i===0?`${month}-02 13:00:00`:r[6]])}}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(system,month){const head=headers[system],rows=records(system,month);return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Parity ${system==='fbs'?'FBS':'iLab'} practice scheduler</title><style>body{font:15px/1.5 system-ui;color:#172033;background:#f3f5f9;margin:0}header{background:#172d57;color:white;padding:24px 40px}main{padding:28px 40px}h1{margin:0;font-size:26px}p{max-width:75ch}a{color:#2556d9}table{border-collapse:collapse;background:white;min-width:1050px}td,th{padding:12px;text-align:left;border-bottom:1px solid #dce2ed}th{background:#e9effd}section{overflow:auto}label{display:block;margin:20px 0}input,button{font:inherit;padding:8px}</style><header><h1>${system==='fbs'?'FBS':'iLab'} practice scheduler</h1><div>Independent Parity simulator · Synthetic data · Not a vendor product</div></header><main><p>This is the scheduling source Parity's agent reads. John books the confocal from 9 to 11. His synthetic computer log ends at 1; that log does not establish when his experiment ended.</p><form><label>Report month <input type="month" name="month" value="${month}"> <button>View report</button></label></form><p>24 reservations · 3 instruments · 1 duplicate export row · 1 cancellation. <a href="/api/${system}/manifest">Inspect read-only source capabilities</a></p><section><table><thead><tr>${head.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section></main></html>`}
async function startSimulator(){
 const retries=new Set();
 const server=http.createServer((req,res)=>{
  const send=(status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(value):value)};
  try{
   if(req.method!=='GET')return send(405,{error:'Practice systems are read-only.'});
   const u=new URL(req.url,'http://127.0.0.1'),parts=u.pathname.split('/').filter(Boolean);
   if(parts.length===1&&SYSTEMS.includes(parts[0]))return send(200,page(parts[0],validMonth(u.searchParams.get('month')||'2026-10')),'text/html; charset=utf-8');
   const [,system,action]=parts;if(parts[0]!=='api'||!SYSTEMS.includes(system)||parts.length!==3)return send(404,{error:'Unknown practice endpoint'});
   if(action==='manifest')return send(200,{system,mode:'synthetic',readOnly:true,format:system==='fbs'?'report-table':'nested-report',resources:`/api/${system}/resources`,reservations:`/api/${system}/reservations`,usage:`/api/${system}/usage`,pageSize:8});
   if(action==='resources')return send(200,{resources});
   const month=validMonth(u.searchParams.get('month')||''),scenario=u.searchParams.get('scenario')||'normal';
   if(action==='usage')return send(200,usage(month));
   if(action!=='reservations')return send(404,{error:'Unknown report'});
   const p=Number(u.searchParams.get('page')||1);if(!Number.isInteger(p)||p<1||p>10)throw Error('Invalid report page.');
   const retryKey=u.searchParams.get('run');if(scenario==='retry'&&p===2&&!retries.has(retryKey)){retries.add(retryKey);if(retries.size>1000)retries.delete(retries.values().next().value);return send(429,{error:'Practice rate limit; retry this page.'})}
   const all=records(system,month,scenario),rows=all.slice((p-1)*8,p*8),nextPage=p*8<all.length?p+1:null;
   const report={headers:headers[system],rows,nextPage,total:all.length};
   return send(200,system==='fbs'?report:{ilab_response:{reservation_report:report}});
  }catch(e){send(400,{error:e.message})}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={startSimulator,records,usage,headers,resources,validMonth};
