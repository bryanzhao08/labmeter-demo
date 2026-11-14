const {app, BrowserWindow, protocol, net, session, shell, Menu, ipcMain, dialog, safeStorage} = require('electron');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const fs = require('node:fs');
const {readSafeFile}=require('./web/safe-read.cjs');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(),'labro-desktop-test-')));
protocol.registerSchemesAsPrivileged([{scheme:'labro',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const root = path.join(__dirname,'web');
function local(url) { try { const u=new URL(url); return u.protocol==='labro:'&&u.host==='app'; } catch {return false;} }
function external(url) { if (/^https:\/\//i.test(url)) shell.openExternal(url); }
let main, credentialWindow;
// ---- Connections: booking-system API access ----
// The token is typed by the manager, encrypted with the operating system's keychain, and used only
// in this process. The page can ask "is a token saved" but can never read it back.
const CONNECTORS={
  ilab:{label:'iLab',hosts:['api.ilabsolutions.com','api-eu.ilabsolutions.com','au-api.ilab.agilent.com','stanford-api.ilabsolutions.com'], // iLab API Reference, June 2025
    paths:{equipment:c=>'/v1/cores/'+c+'/equipment.json',services:c=>'/v1/cores/'+c+'/services.json'}}
};
const connPath=()=>path.join(app.getPath('userData'),'connection.json');
let conn=null,memToken=null;
function loadConn(){try{conn=JSON.parse(fs.readFileSync(connPath(),'utf8'))}catch{conn=null}return conn}
function connToken(){
  if(memToken)return memToken;
  try{if(conn&&conn.token&&safeStorage.isEncryptionAvailable())return safeStorage.decryptString(Buffer.from(conn.token,'base64'))}catch{}
  return null;
}
function connPublic(){const c=conn||{};return {system:c.system||null,base:c.base||null,coreId:c.coreId||null,hasToken:!!connToken(),canStore:safeStorage.isEncryptionAvailable()}}
function connBase(system,base){
  const def=CONNECTORS[system];if(!def)throw new Error('Unknown system');
  if(smoke&&process.env.LABRO_TEST_API)return process.env.LABRO_TEST_API;
  const u=new URL(base||('https://'+def.hosts[0]));
  if(u.protocol!=='https:'||!def.hosts.includes(u.hostname))throw new Error('That address is not a known '+def.label+' API server.');
  return u.origin;
}
// First array of objects with a name, wherever the vendor nests it.
function findList(v,depth){
  if(depth>5||v==null)return null;
  if(Array.isArray(v)){if(v.length&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))return v;return null}
  if(typeof v==='object')for(const k of Object.keys(v)){const r=findList(v[k],(depth||0)+1);if(r)return r}
  return null;
}
async function connFetch(kind){
  const c=conn||{},def=CONNECTORS[c.system];if(!def)throw new Error('No connection is set up.');
  const token=connToken();if(!token)throw new Error('No API token is saved.');
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(String(c.coreId||'')))throw new Error('Enter the core ID from your '+def.label+' web address.');
  const url=connBase(c.system,c.base)+def.paths[kind](c.coreId),ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),15000);
  try{
    // redirect:'error' so the token can never follow a redirect to another host.
    const r=await fetch(url,{headers:{Authorization:'bearer '+token,Accept:'application/json'},redirect:'error',signal:ctl.signal});
    if(r.status===401||r.status===403)throw new Error(def.label+' refused the token (status '+r.status+'). Check the token and that API access is switched on for your core.');
    if(r.status===404)throw new Error(def.label+' did not find core '+c.coreId+' (status 404). Check the core ID.');
    if(!r.ok)throw new Error(def.label+' answered with status '+r.status+'.');
    const text=await r.text();let json;try{json=JSON.parse(text)}catch{throw new Error(def.label+' did not answer with JSON.')}
    return findList(json,0)||[];
  }catch(e){if(e.name==='AbortError')throw new Error(def.label+' did not answer within 15 seconds.');if(/fetch failed/i.test(e.message))throw new Error('Could not reach '+def.label+'. Check the internet connection.');throw e}
  finally{clearTimeout(t)}
}
const nameOf=x=>String(x.name||x.equipment_name||x.title||x.label||'').trim();
// Installed software that hints at the booking system. Folder names only; nothing is opened.
function findApps(){
  const dirs=process.platform==='win32'?[process.env['ProgramFiles'],process.env['ProgramFiles(x86)'],process.env['ProgramData'],process.env['LOCALAPPDATA']&&path.join(process.env['LOCALAPPDATA'],'Programs')]
    :process.platform==='darwin'?['/Applications',path.join(app.getPath('home'),'Applications')]:['/opt','/usr/share/applications'];
  const rx=[['fbs',/\bfbs\b|facility billing|softlock|soft lock|priority software/i],['ilab',/\bilab\b|crosslab/i],['ppms',/\bppms\b|stratocore/i],['bookitlab',/bookitlab/i]];
  const out=[];
  for(const d of dirs.filter(Boolean)){let items;try{items=fs.readdirSync(d)}catch{continue}
    for(const n of items)for(const [system,r] of rx)if(r.test(n)&&!/^labro/i.test(n))out.push({system,name:n})}
  return out.slice(0,20);
}
// ---- Folder access: one folder chosen by the person, read-only, spreadsheets and text only ----
const FILE_RX=/\.(csv|tsv|txt|xlsx|xls)$/i, MAX_BYTES=20*1024*1024;
let folder=null, watcher=null, timer=null;
const cfgPath=()=>path.join(app.getPath('userData'),'folder.json');
function loadFolder(){
  if(smoke){
    // A throwaway folder with oddly named exports, as a real manager's Downloads folder would have.
    const d=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'labro-folder-test-')),m=path.join(root,'data','mock');
    for(const [from,to] of [['fbs-reservations.csv','Export 2026-10-31 (3).csv'],['usage-log.csv','Logs_all instruments.csv'],['price-sheet.csv','Core rates fall.csv']])fs.copyFileSync(path.join(m,from),path.join(d,to));
    fs.writeFileSync(path.join(d,'notes.txt'),'Remember to email the dean about the budget.\n');
    return d;
  }
  try{const f=JSON.parse(fs.readFileSync(cfgPath(),'utf8')).folder;if(f&&fs.statSync(f).isDirectory())return f}catch{}
  return null;
}
function saveFolder(){try{fs.writeFileSync(cfgPath(),JSON.stringify({folder}))}catch{}}
function stopWatch(){if(watcher){try{watcher.close()}catch{}watcher=null}}
function startWatch(){
  stopWatch();if(!folder)return;
  try{watcher=fs.watch(folder,{recursive:true},()=>{clearTimeout(timer);timer=setTimeout(()=>{if(main&&!main.isDestroyed())main.webContents.send('labro:folder-changed')},800)});watcher.on('error',()=>{})}catch{}
}
function listFiles(){
  const out=[];
  (function walk(dir,depth){
    let items;try{items=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
    for(const it of items){
      if(it.name.startsWith('.')||it.name.startsWith('~$')||it.name==='node_modules')continue;
      const full=path.join(dir,it.name);
      if(it.isDirectory()){if(depth<2)walk(full,depth+1);continue}
      if(!it.isFile()||!FILE_RX.test(it.name))continue;
      try{const st=fs.statSync(full);if(st.size>0&&st.size<=MAX_BYTES)out.push({name:path.relative(folder,full),size:st.size,mtime:Math.round(st.mtimeMs)})}catch{}
    }
  })(folder,0);
  return out.sort((a,b)=>b.mtime-a.mtime).slice(0,200);
}
const trusted=e=>{try{return new URL(e.senderFrame.url).protocol==='labro:'}catch{return false}};
ipcMain.handle('labro:conn:get',e=>trusted(e)?connPublic():null);
ipcMain.handle('labro:conn:save',async(e,d)=>{
  if(!trusted(e)||e.sender!==main.webContents||!d||typeof d!=='object')throw new Error('Not allowed');
  if(!CONNECTORS[d.system])throw new Error('Unknown system');
  const base=connBase(d.system,d.base),coreId=String(d.coreId||'').trim();
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(coreId))throw new Error('Enter a valid core ID.');
  if(credentialWindow)throw new Error('The token window is already open.');
  return new Promise(resolve=>{
    const win=credentialWindow=new BrowserWindow({parent:main,modal:true,width:480,height:300,resizable:false,show:!smoke,title:'iLab API token',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'credential-preload.cjs')}});
    let finished=false;
    const finish=result=>{if(finished)return;finished=true;credentialWindow=null;resolve(result);if(!win.isDestroyed())win.close()};
    win.on('closed',()=>finish({saved:false}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.loadFile(path.join(__dirname,'credential.html'));
    win._saveToken=token=>{
      try{
        token=typeof token==='string'?token.trim():'';
        if(token.length>4000)throw new Error('That token is too long.');
        if(!token&&!(conn&&conn.system===d.system&&connToken()))throw new Error('Paste the API token from iLab.');
        const next={system:d.system,base,coreId,token:conn&&conn.system===d.system?conn.token:undefined};
        if(token){if(safeStorage.isEncryptionAvailable()){next.token=safeStorage.encryptString(token).toString('base64');memToken=null}else{memToken=token;next.token=undefined}}
        conn=next;fs.writeFileSync(connPath(),JSON.stringify(conn),{mode:0o600});
        finish({saved:true,info:connPublic()});
        return null;
      }catch(err){return err.message}
    };
  });
});
ipcMain.handle('labro:credential:submit',(e,token)=>{
  if(!credentialWindow||e.sender!==credentialWindow.webContents||e.senderFrame!==credentialWindow.webContents.mainFrame)throw new Error('Not allowed');
  return credentialWindow._saveToken(token);
});
ipcMain.handle('labro:conn:forget',e=>{if(!trusted(e))return null;conn=null;memToken=null;try{fs.rmSync(connPath(),{force:true})}catch{}return connPublic()});
ipcMain.handle('labro:conn:test',async e=>{
  if(!trusted(e))return {ok:false,message:'Not allowed'};
  try{const list=await connFetch('equipment');return {ok:true,count:list.length,equipment:[...new Set(list.map(nameOf).filter(Boolean))].slice(0,100)}}
  catch(err){return {ok:false,message:err.message}}
});
ipcMain.handle('labro:detect:apps',e=>trusted(e)?findApps():[]);
const rulesPath=()=>path.join(app.getPath('userData'),'rules.json');
ipcMain.handle('labro:rules:save',(e,json)=>{
  if(!trusted(e)||typeof json!=='string'||json.length>2*1024*1024)return false;
  try{JSON.parse(json);fs.writeFileSync(rulesPath(),json,{mode:0o600});return true}catch{return false}
});
ipcMain.handle('labro:mcp:info',e=>{
  if(!trusted(e))return null;
  const script=path.join(root,'mcp','labro-mcp.cjs');
  const args=[script,'--folder',folder||'<your exports folder>'];if(fs.existsSync(rulesPath()))args.push('--rules',rulesPath());
  return {available:fs.existsSync(script),command:process.execPath,args,env:{ELECTRON_RUN_AS_NODE:'1'},folder};
});
ipcMain.handle('labro:folder:get',e=>trusted(e)?folder:null);
ipcMain.handle('labro:folder:pick',async e=>{
  if(!trusted(e))return folder;
  const r=await dialog.showOpenDialog(main,{title:'Choose the folder where you save booking-system exports',properties:['openDirectory'],defaultPath:folder||app.getPath('downloads')});
  if(!r.canceled&&r.filePaths[0]){folder=r.filePaths[0];saveFolder();startWatch()}
  return folder;
});
ipcMain.handle('labro:folder:forget',e=>{if(!trusted(e))return null;folder=null;stopWatch();try{fs.rmSync(cfgPath(),{force:true})}catch{}return null});
ipcMain.handle('labro:folder:scan',e=>trusted(e)&&folder?listFiles():[]);
ipcMain.handle('labro:folder:read',(e,name)=>{
  if(!trusted(e)||!folder||typeof name!=='string'||!FILE_RX.test(name))throw new Error('Not allowed');
  return readSafeFile(folder,name,MAX_BYTES);
});
async function createWindow() {
  main = new BrowserWindow({width:1360,height:900,minWidth:800,minHeight:600,title:'LaBro',
    show:!smoke,backgroundColor:'#101615',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
  main.webContents.on('will-navigate',(e,url)=>{if(!local(url)){e.preventDefault();external(url);}});
  main.webContents.setWindowOpenHandler(({url})=>{
    // Statements use local blob documents; give them the same sandboxed renderer.
    if(url.startsWith('blob:labro://app/')) return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}};
    external(url); return {action:'deny'};
  });
  await main.loadURL('labro://app/app.html');
  if(smoke) {
    try {
      const result=await main.webContents.executeJavaScript(String.raw`(async()=>{
        const pause=ms=>new Promise(r=>setTimeout(r,ms));
        const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await pause(50)}throw Error('Timed out waiting for app state')};
        await wait(()=>document.querySelector('.how-list'));
        const sidebar=document.getElementById('sidebar');
        if(typeof require!=='undefined')throw Error('Node exposed');
        if(!window.XLSX)throw Error('Offline spreadsheet reader missing');
        await document.fonts.ready;
        if(!document.fonts.check('14px Inter')||!/Inter/.test(getComputedStyle(document.body).fontFamily))throw Error('Inter font not loaded');
        const originalFetch=window.fetch;window.fetch=(url,...rest)=>String(url).startsWith('http://127.0.0.1:11434/')?Promise.reject(Error('offline')):originalFetch(url,...rest);
        if(!window.labroFS)throw Error('Folder bridge missing');
        for(const k of ['require','process','fs'])if(typeof window.labroFS[k]!=='undefined')throw Error('Folder bridge leaks '+k);
        // The folder holds oddly named files; LaBro must tell them apart by content.
        await wait(()=>document.querySelectorAll('.frow').length>=3);
        const frows=[...document.querySelectorAll('.frow')].map(r=>r.innerText);
        const has=k=>frows.some(t=>t.includes(k));
        if(!has('Reservations')||!has('Usage log')||!has('Price sheet'))throw Error('Files not recognised: '+frows.join(' || '));
        if(!frows.some(t=>t.includes('notes.txt')&&t.includes('Not recognised')))throw Error('Unrelated file not left out');
        if([...document.querySelectorAll('.frow input:checked')].length!==3)throw Error('Default file choice wrong');
        document.getElementById('start-continue').click();await wait(()=>document.getElementById('save-profile'));
        const priceRows=document.querySelectorAll('.price tbody tr').length;
        if(priceRows<8)throw Error('Prices not read from the sheet: '+priceRows);
        const heads=[...document.querySelectorAll('.price th')].map(x=>x.innerText).join('|');
        if(!/Internal/.test(heads)||!/External/.test(heads)||!/Commercial/.test(heads)||!/After hours/.test(heads))throw Error('Rate tiers missing: '+heads);
        if(!document.getElementById('ah-start'))throw Error('After-hours window missing');
        if(!document.body.innerText.includes('hourly prices from Core rates fall.csv'))throw Error('Price source note missing');
        if(document.querySelector('[data-group=instrument_type]'))throw Error('Preset machine buttons still shown');
        document.querySelector('[data-machine="Cell sorter"]').click();await wait(()=>document.querySelector('[data-machine="Cell sorter"]').getAttribute('aria-pressed')==='false');
        document.getElementById('new-machine').value='Confocal microscope 2';document.getElementById('add-machine').click();await wait(()=>[...document.querySelectorAll('[data-machine]')].some(b=>b.textContent==='Confocal microscope 2'));
        document.getElementById('save-profile').click();
        // Saved: the schedule fills straight from the folder, with no upload step.
        await wait(()=>location.hash==='#schedule'&&document.querySelector('.tl .blk'));
        const blocks=document.querySelectorAll('.blk').length;if(blocks<3)throw Error('Few reservation blocks: '+blocks);
        if(!document.querySelector('.use'))throw Error('Logged use bars missing');
        if(!document.querySelector('.band'))throw Error('After-hours shading missing');
        if(!/Ready to bill/.test(document.querySelector('.stats').innerText))throw Error('Billing summary missing');
        document.querySelector('.blk[data-res]').click();await wait(()=>document.querySelector('.drawer'));
        const dr=document.querySelector('.drawer').innerText;
        if(!/Reservation/.test(dr)||!/Rate/.test(dr)||!/per hour/.test(dr))throw Error('Reservation details incomplete');
        document.querySelector('[data-view=week]').click();await wait(()=>document.querySelector('.week'));
        document.querySelector('[data-view=day]').click();await wait(()=>document.querySelector('.tl'));
        location.hash='results';await wait(()=>document.querySelector('table tbody tr'));
        if(!document.getElementById('screen').innerText.match(/\$[0-9,]+\.\d{2}/))throw Error('Dollar amount missing');
        document.querySelector('[data-filter=look]').click();await wait(()=>document.querySelector('[data-filter=look][aria-pressed=true]'));
        if(!document.getElementById('screen').innerText.includes('Needs a look'))throw Error('Held row missing');
        if(document.getElementById('export').disabled)throw Error('Export disabled for a clean month');
        location.hash='upload';await wait(()=>document.getElementById('log-file'));
        if(!document.getElementById('analyze-folder')||document.getElementById('analyze-folder').disabled)throw Error('Check this month button not ready');
        if(!document.body.innerText.includes('Just curious?'))throw Error('Simulated data prompt missing');
        // The test report holds structure and counts, never names.
        let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{copied=t}},configurable:true});
        document.querySelector('[data-report]').click();await wait(()=>copied);
        if(!/LaBro test report/.test(copied)||!/Analysis: \d+ sessions/.test(copied))throw Error('Report incomplete');
        if(/User [A-H]\b|John|Export 2026|PTA-|\$\d/.test(copied))throw Error('Report leaks private details');
        if(sidebar!==document.getElementById('sidebar'))throw Error('Sidebar replaced');
        return {xlsx:XLSX.version,priceRows,blocks,files:frows.length,report:copied.split('\n').length};
      })()`);
      // Optional, synthetic-data-only product captures for the pitch and manual review.
      if(process.env.LABRO_CAPTURE_DIR){
        const captures=path.resolve(process.env.LABRO_CAPTURE_DIR);fs.mkdirSync(captures,{recursive:true});
        await new Promise(resolve=>setTimeout(resolve,3500));
        for(const page of ['upload','schedule','results']){
          await main.webContents.executeJavaScript(`(async()=>{location.hash=${JSON.stringify(page)};await new Promise(resolve=>setTimeout(resolve,500));await document.fonts.ready;window.scrollTo(0,0)})()`);
          fs.writeFileSync(path.join(captures,page+'.png'),(await main.webContents.capturePage()).toPNG());
        }
        await main.webContents.executeJavaScript("location.hash='upload'");
      }
      // A new export lands in the folder while the app is open: it must be picked up without a click.
      const m=path.join(root,'data','mock','fbs-reservations.csv'),lines=fs.readFileSync(m,'utf8').split('\n');
      fs.writeFileSync(path.join(folder,'Newer export.csv'),[lines[0],...lines.slice(1,5)].join('\n')+'\n');
      const watched=await main.webContents.executeJavaScript(String.raw`(async()=>{
        const pause=ms=>new Promise(r=>setTimeout(r,ms));
        for(let i=0;i<200;i++){const rows=[...document.querySelectorAll('.frow')];if(rows.some(r=>r.innerText.includes('Newer export.csv')))break;await pause(50)}
        const row=[...document.querySelectorAll('.frow')].find(r=>r.innerText.includes('Newer export.csv'));
        if(!row)throw Error('New file not picked up from the folder');
        if(!row.querySelector('input').checked)throw Error('Newest reservation export not chosen');
        const old=[...document.querySelectorAll('.frow')].find(r=>r.innerText.includes('Export 2026-10-31'));
        if(old.querySelector('input').checked)throw Error('Old reservation export still in use');
        return true})()`);
      // Connections: a stand-in iLab server on this machine checks that the token travels only in the header.
      const seen=[];
      const api=require('node:http').createServer((q,r)=>{seen.push({url:q.url,auth:q.headers.authorization||''});
        if(q.headers.authorization!=='bearer test-token-123'){r.writeHead(401);r.end('{}');return}
        r.writeHead(200,{'Content-Type':'application/json'});r.end(JSON.stringify({ilab_response:{equipment:[{id:1,name:'Aria III sorter'},{id:2,name:'LSM 980 confocal'}]}}))});
      await new Promise(ok=>api.listen(0,'127.0.0.1',ok));process.env.LABRO_TEST_API='http://127.0.0.1:'+api.address().port;
      let credentialStep=0,lastCredential=null;
      const credentialTest=setInterval(async()=>{
        const win=credentialWindow;
        if(!win||win===lastCredential||win.isDestroyed()||win.webContents.isLoading())return;
        lastCredential=win;credentialStep++;
        if(credentialStep===2){win.close();return}
        const token=credentialStep===1?'wrong-token':'test-token-123';
        await win.webContents.executeJavaScript(`document.getElementById('token').value=${JSON.stringify(token)};document.querySelector('form').requestSubmit()`);
      },50);
      const connected=await main.webContents.executeJavaScript(String.raw`(async()=>{
        const pause=ms=>new Promise(r=>setTimeout(r,ms));
        const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await pause(50)}throw Error('Timed out waiting for connections page')};
        location.hash='connect';await wait(()=>document.getElementById('sys-url'));
        document.getElementById('sys-url').value='usc.fbs.io';document.getElementById('sys-find').click();
        await wait(()=>/Connect to FBS through its exports/.test(document.body.innerText));
        if(!/Folder connected/.test(document.body.innerText))throw Error('FBS card does not show the connected folder');
        document.getElementById('sys-url').value='https://my.ilabsolutions.com/service_center/show_external/5582';document.getElementById('sys-find').click();
        await wait(()=>document.getElementById('ilab-save'));
        if(document.getElementById('ilab-core').value!=='5582')throw Error('Core ID not read from the web address');
        if(document.getElementById('ilab-token'))throw Error('Token field present in main page');
        document.getElementById('ilab-save').click();
        await wait(()=>/Not connected/.test(document.body.innerText));
        if(!/refused the token/.test(document.body.innerText))throw Error('Bad token not explained');
        document.getElementById('ilab-save').click();
        await wait(()=>document.getElementById('ilab-save')&&!document.getElementById('ilab-save').disabled);
        if(/Connected\./.test(document.body.innerText))throw Error('Cancelled entry reported success');
        document.getElementById('ilab-save').click();
        await wait(()=>/Connected\./.test(document.body.innerText));
        if(!/Aria III sorter/.test(document.body.innerText))throw Error('Equipment list missing');
        if(document.getElementById('ilab-token'))throw Error('Token field present in main page');
        const info=await window.labroConn.get();
        if(!info.hasToken||JSON.stringify(info).includes('test-token'))throw Error('Token readable from the page');
        if(document.documentElement.innerHTML.includes('test-token-123'))throw Error('Token present in the page');
        const cfg=document.getElementById('mcp-config');if(!cfg||!/labro-mcp\.cjs/.test(cfg.value)||!/--rules/.test(cfg.value)||!/ELECTRON_RUN_AS_NODE/.test(cfg.value))throw Error('MCP settings incomplete');
        document.getElementById('ilab-machines').click();
        document.getElementById('conn-forget').click();await wait(()=>!document.getElementById('conn-forget'));
        return true})()`);
      clearInterval(credentialTest);
      if(credentialStep!==3)throw new Error('Credential window coverage incomplete');
      api.close();
      if(seen.length!==2||seen.some(x=>!/^\/v1\/cores\/5582\/equipment\.json$/.test(x.url)))throw new Error('Unexpected API calls: '+JSON.stringify(seen.map(x=>x.url)));
      if(seen[0].auth!=='bearer wrong-token'||seen[seen.length-1].auth!=='bearer test-token-123')throw new Error('Token not sent as a bearer header');
      if(fs.existsSync(connPath()))throw new Error('Connection file left behind after removal');
      fs.writeFileSync(path.join(require('node:os').tmpdir(),'labro-app.png'),(await main.webContents.capturePage()).toPNG());
      console.log('DESKTOP PASS '+JSON.stringify({...result,watched,connected}));app.exit(0);
    } catch(e){console.error(e);app.exit(1);}
  }
}
app.whenReady().then(async()=>{
  folder=loadFolder();startWatch();loadConn();
  protocol.handle('labro',request=>{
    try {
      const u=new URL(request.url);
      if(u.host!=='app'||!['GET','HEAD'].includes(request.method))return new Response('',{status:403});
      const target=path.resolve(root,'.'+decodeURIComponent(u.pathname));
      const rel=path.relative(root,target);
      if(!rel||rel.startsWith('..')||path.isAbsolute(rel))return new Response('',{status:403});
      return net.fetch(pathToFileURL(target).href);
    }catch{return new Response('',{status:400});}
  });
  session.defaultSession.setPermissionRequestHandler((wc,permission,done)=>done(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  // Desktop workflows run entirely from the bundle. Documentation opens in the browser.
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,done)=>done({cancel:!/^http:\/\/127\.0\.0\.1:11434\/api\/generate(?:\?|$)/.test(details.url)}));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
    {label:'File',submenu:[{role:'close'}]},
    {role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}
  ]));
  await createWindow();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin'||smoke)app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
