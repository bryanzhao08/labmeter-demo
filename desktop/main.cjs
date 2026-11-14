const {app, BrowserWindow, protocol, net, session, shell, Menu, ipcMain, dialog} = require('electron');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const fs = require('node:fs');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(),'labro-desktop-test-')));
protocol.registerSchemesAsPrivileged([{scheme:'labro',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const root = path.join(__dirname,'web');
function local(url) { try { const u=new URL(url); return u.protocol==='labro:'&&u.host==='app'; } catch {return false;} }
function external(url) { if (/^https:\/\//i.test(url)) shell.openExternal(url); }
let main;
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
  const base=fs.realpathSync(folder),target=fs.realpathSync(path.resolve(base,name)),rel=path.relative(base,target);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Not allowed');
  const st=fs.statSync(target);if(!st.isFile()||st.size>MAX_BYTES)throw new Error('File too large');
  return fs.readFileSync(target);
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
      fs.writeFileSync(path.join(require('node:os').tmpdir(),'labro-app.png'),(await main.webContents.capturePage()).toPNG());
      console.log('DESKTOP PASS '+JSON.stringify({...result,watched}));app.exit(0);
    } catch(e){console.error(e);app.exit(1);}
  }
}
app.whenReady().then(async()=>{
  folder=loadFolder();startWatch();
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
