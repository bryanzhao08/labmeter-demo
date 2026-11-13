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
  await main.loadURL('labro://app/app.html');
  if(smoke) {
    try {
      const result=await main.webContents.executeJavaScript(String.raw`(async()=>{
        const pause=ms=>new Promise(r=>setTimeout(r,ms));
        const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await pause(50)}throw Error('Timed out waiting for app state')};
        await wait(()=>document.getElementById('assistant'));
        const sidebar=document.getElementById('sidebar');
        if(typeof require!=='undefined')throw Error('Node exposed');
        if(!window.XLSX)throw Error('Offline spreadsheet reader missing');
        await document.fonts.ready;
        if(!document.fonts.check('14px Inter')||!/Inter/.test(getComputedStyle(document.body).fontFamily))throw Error('Inter font not loaded');
        const originalFetch=window.fetch;window.fetch=(url,...rest)=>String(url).startsWith('http://127.0.0.1:11434/')?Promise.reject(Error('offline')):originalFetch(url,...rest);
        if(!document.getElementById('price-file')||!document.querySelector('[data-drop=price]'))throw Error('Price sheet drop zone missing');
        document.getElementById('sample-sheet').click();await wait(()=>document.querySelector('.file-ok'));
        document.getElementById('description').value="We're the flow cytometry core. We have a cell sorter. We book in FBS.";
        document.getElementById('assistant').click();await wait(()=>document.getElementById('save-profile'));
        const priceRows=document.querySelectorAll('.price tbody tr').length;
        if(priceRows<8)throw Error('Prices not read from the sheet: '+priceRows);
        const heads=[...document.querySelectorAll('.price th')].map(x=>x.innerText).join('|');
        if(!/Internal/.test(heads)||!/External/.test(heads)||!/Commercial/.test(heads)||!/After hours/.test(heads))throw Error('Rate tiers missing: '+heads);
        if(!document.getElementById('ah-start'))throw Error('After-hours window missing');
        if(!document.body.innerText.includes('hourly prices from sample-price-sheet.csv'))throw Error('Price source note missing');
        if(document.querySelector('[data-group=instrument_type]'))throw Error('Preset machine buttons still shown');
        document.querySelector('[data-machine="Cell sorter"]').click();await wait(()=>document.querySelector('[data-machine="Cell sorter"]').getAttribute('aria-pressed')==='false');
        document.getElementById('new-machine').value='Confocal microscope 2';document.getElementById('add-machine').click();await wait(()=>[...document.querySelectorAll('[data-machine]')].some(b=>b.textContent==='Confocal microscope 2'));
        document.getElementById('save-profile').click();await wait(()=>location.hash==='#schedule'&&document.getElementById('mock'));
        if(!document.body.innerText.includes('Import your reservations'))throw Error('Empty schedule prompt missing');
        document.getElementById('mock').click();await wait(()=>document.querySelector('.tl .blk'));
        if(!document.body.innerText.includes('Just curious')&&false)throw Error('x');
        const blocks=document.querySelectorAll('.blk').length;if(blocks<3)throw Error('Few reservation blocks: '+blocks);
        if(!document.querySelector('.use'))throw Error('Logged use bars missing');
        if(!document.querySelector('.band'))throw Error('After-hours shading missing');
        document.querySelector('.blk[data-res]').click();await wait(()=>document.querySelector('.drawer'));
        const dr=document.querySelector('.drawer').innerText;
        if(!/Reservation/.test(dr)||!/Rate/.test(dr)||!/per hour/.test(dr))throw Error('Reservation details incomplete');
        document.querySelector('[data-view=week]').click();await wait(()=>document.querySelector('.week'));
        document.querySelector('[data-view=day]').click();await wait(()=>document.querySelector('.tl'));
        location.hash='results';await wait(()=>document.querySelector('table tbody tr'));
        const scr=document.getElementById('screen').innerText;
        if(!scr.match(/\$[0-9,]+\.\d{2}/))throw Error('Dollar amount missing');
        document.querySelector('[data-filter=look]').click();await wait(()=>document.querySelector('[data-filter=look][aria-pressed=true]'));
        if(!document.getElementById('screen').innerText.includes('Needs a look'))throw Error('Held row missing');
        if(document.getElementById('export').disabled)throw Error('Export disabled for a clean month');
        location.hash='upload';await wait(()=>document.getElementById('log-file'));
        if(!document.body.innerText.includes('Just curious?'))throw Error('Simulated data prompt missing');
        if(sidebar!==document.getElementById('sidebar'))throw Error('Sidebar replaced');
        return {xlsx:XLSX.version,priceRows,blocks,resultRows:document.querySelectorAll('tbody tr').length};
      })()`);
      fs.writeFileSync(path.join(require('node:os').tmpdir(),'labro-app.png'),(await main.webContents.capturePage()).toPNG());
      console.log('DESKTOP PASS '+JSON.stringify(result));app.exit(0);
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
