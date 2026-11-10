(()=>{
'use strict';
const $=id=>document.getElementById(id), C=window.LMAuditCore, E=window.LBFolder;
let candidates=[],selected=[],result=null,version=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved={};try{saved=JSON.parse(localStorage.getItem('labro-folder-profile')||'{}');}catch{}
for(const key of ['instrument','kind','clock'])if(saved[key])$(key).value=saved[key];
function profile(){return Object.fromEntries(['instrument','kind','clock','user','start','end'].map(k=>[k,$(k)?.value||'']));}
function invalidate(){version++;result=null;$('results').innerHTML='';}
function showFiles(){
  invalidate();selected=[];
  const filter=$('filter').value.toLowerCase(), visible=candidates.filter(f=>f.webkitRelativePath.toLowerCase().includes(filter));
  $('files').innerHTML='<table><thead><tr><th>Select</th><th>Relative path</th><th>Size</th></tr></thead><tbody>'+visible.map(f=>'<tr><td><input type="checkbox" data-file="'+candidates.indexOf(f)+'" aria-label="Select '+esc(f.webkitRelativePath)+'"></td><td>'+esc(f.webkitRelativePath)+'</td><td>'+Math.ceil(f.size/1024)+' KB</td></tr>').join('')+'</tbody></table>';
  $('mapping').innerHTML='';$('preview').disabled=true;
}
$('folder').onchange=()=>{
  const all=Array.from($('folder').files);
  candidates=all.filter(f=>/\.(csv|tsv|txt|log)$/i.test(f.name)&&f.size<=2*1024*1024).slice(0,200);
  $('status').textContent=all.length+' files selected; '+candidates.length+' candidate text logs shown (maximum 200, 2 MB each). Other files are not read.';
  showFiles();
};
$('filter').oninput=showFiles;
$('files').onchange=async()=>{
  invalidate(); const token=version;
  selected=Array.from(document.querySelectorAll('[data-file]:checked')).map(el=>candidates[+el.dataset.file]);
  $('preview').disabled=true;$('mapping').innerHTML='';
  if(!selected.length)return;
  if(selected.reduce((n,f)=>n+f.size,0)>10*1024*1024){$('error').textContent='Select at most 10 MB of logs at once.';return;}
  try{
    const text=await selected[0].text();if(token!==version)return;
    if(text.includes('\0'))throw Error('This looks like binary data. Select a delimited text export.');
    const head=C.parseCSV(text).head;
    $('mapping').innerHTML=['user','start','end'].map(k=>'<label>'+({user:'User column',start:'Start column',end:'End column'}[k])+'<select id="'+k+'">'+head.map(h=>'<option>'+esc(h)+'</option>').join('')+'</select></label>').join('');
    for(const k of ['user','start','end']){const guess=saved[k]||head.find(h=>({user:/user|operator/i,start:/start|begin|logon/i,end:/end|stop|logoff/i}[k]).test(h));if(guess&&head.includes(guess))$(k).value=guess;}
    $('preview').disabled=false;$('error').textContent='';
  }catch(e){$('error').textContent=e.message;}
};
$('save').onclick=()=>{try{localStorage.setItem('labro-folder-profile',JSON.stringify(profile()));$('error').textContent='Profile saved on this computer.';}catch{$('error').textContent='Could not save the profile.';}};
for(const k of ['instrument','kind','clock'])$(k).onchange=invalidate;
$('mapping').onchange=invalidate;
$('preview').onclick=async()=>{
  invalidate();const token=version;
  try{
    const files=await Promise.all(selected.map(async f=>({name:f.webkitRelativePath,text:await f.text()})));
    if(token!==version)return;
    if(files.some(f=>f.text.includes('\0')))throw Error('A selected file contains binary data. Select text exports only.');
    result=E.parse(files,profile(),C);const label={acquisition:'Acquisition',login:'Computer session',reservation:'Reserved'}[profile().kind];
    $('results').innerHTML='<h2>'+label+' evidence</h2><p>'+result.rows.length+' unique intervals · '+result.rows.reduce((s,r)=>s+r.minutes,0).toFixed(2)+' minutes before overlap review. These are source intervals, not approved charges.</p>'+
      (result.issues.length?'<p role="alert">'+result.issues.map(esc).join('<br>')+'</p>':'<p>No invalid or overlapping intervals detected. Verify these against the source software.</p>')+
      '<button id="export" class="btn" '+(result.issues.length||!result.rows.length?'disabled':'')+'>Download evidence CSV</button><div class="tw"><table><thead><tr><th>User</th><th>Start</th><th>End</th><th>Minutes</th><th>Source</th></tr></thead><tbody>'+
      result.rows.slice(0,100).map(r=>'<tr><td>'+esc(r.user)+'</td><td>'+esc(r.start)+'</td><td>'+esc(r.end)+'</td><td>'+r.minutes.toFixed(2)+'</td><td>'+esc(r.source)+':'+r.line+'</td></tr>').join('')+'</tbody></table></div><p class="small">First 100 intervals shown; export includes all valid intervals.</p>';
    $('export').onclick=()=>{const u=URL.createObjectURL(new Blob([E.csv(result)],{type:'text/csv'})),a=document.createElement('a');a.href=u;a.download='labro-'+profile().kind+'-evidence.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
    $('error').textContent='';
  }catch(e){$('error').textContent=e.message;}
};
})();
