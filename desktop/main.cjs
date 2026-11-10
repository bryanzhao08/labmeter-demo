const {app, BrowserWindow, protocol, net, session, shell, Menu} = require('electron');
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
async function createWindow() {
  main = new BrowserWindow({width:1360,height:900,minWidth:800,minHeight:600,title:'LaBro',
    show:!smoke,backgroundColor:'#101615',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  main.webContents.on('will-navigate',(e,url)=>{if(!local(url)){e.preventDefault();external(url);}});
  main.webContents.setWindowOpenHandler(({url})=>{
    // Statements use local blob documents; give them the same sandboxed renderer.
    if(url.startsWith('blob:labro://app/')) return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}};
    external(url); return {action:'deny'};
  });
  await main.loadURL('labro://app/close.html#requests');
  if(smoke) {
    try {
      const result=await main.webContents.executeJavaScript(`(async()=>{
        for(let i=0;i<100&&!document.querySelector('[data-dk=add]');i++)await new Promise(r=>setTimeout(r,50));
        const results=[];
        for(const tab of ['requests','rules','services','close','campus']) {
          location.hash=tab;await new Promise(r=>setTimeout(r,100));
          if(document.getElementById('app').innerText.length<100)throw Error('Empty '+tab);
          results.push(tab);
        }
        const script=document.createElement('script');script.src='vendor/xlsx.full.min.js';
        await new Promise((ok,no)=>{script.onload=ok;script.onerror=no;document.head.appendChild(script)});
        if(!window.XLSX)throw Error('Offline spreadsheet reader missing');
        if(typeof require!=='undefined')throw Error('Node exposed');
        localStorage.setItem('desktop-smoke','yes');
        return {tabs:results,xlsx:XLSX.version,storage:localStorage.getItem('desktop-smoke')};
      })()`);
      await main.loadURL('labro://app/folders.html');
      const folderTest=await main.webContents.executeJavaScript(`(async()=>{
        const f=new File(['operator,begin,finish\\nada,2026-11-10 09:00:00,2026-11-10 09:03:00'],'usage.csv');
        Object.defineProperty(f,'webkitRelativePath',{value:'NMR/logs/usage.csv'});
        const dt=new DataTransfer();dt.items.add(f);
        document.getElementById('folder').files=dt.files;document.getElementById('folder').dispatchEvent(new Event('change'));
        const check=document.querySelector('[data-file]');check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));
        for(let i=0;i<50&&document.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,20));
        document.getElementById('instrument').value='NMR';
        document.getElementById('end').value='finish';
        document.getElementById('preview').click();await new Promise(r=>setTimeout(r,100));
        if(!document.getElementById('results').innerText.includes('3.00 minutes'))throw Error('Folder preview failed');
        if(document.getElementById('export').disabled)throw Error('Evidence export disabled');
        return 'folder selection, mapping and acquisition preview passed';
      })()`);
      console.log('DESKTOP PASS '+JSON.stringify(result)+' '+folderTest);app.exit(0);
    } catch(e){console.error(e);app.exit(1);}
  }
}
app.whenReady().then(async()=>{
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
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,done)=>done({cancel:true}));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
    {label:'File',submenu:[{label:'Requests',click:()=>main.loadURL('labro://app/close.html#requests')},
      {label:'Research office',click:()=>main.loadURL('labro://app/close.html#campus')},{type:'separator'},{role:'close'}]},
    {role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}
  ]));
  await createWindow();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin'||smoke)app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
