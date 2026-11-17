// Captures stills of the real app on the simulated month for the demo film. Run: npx electron demo/v6/capture-stills.cjs
const {app,BrowserWindow,protocol,net}=require('electron');const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'parity',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const root=path.join(__dirname,'..','..','desktop','web'),out=path.join(__dirname,'stills');
app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'parity-stills-')));
app.whenReady().then(async()=>{
  protocol.handle('parity',r=>{const u=new URL(r.url);return net.fetch(pathToFileURL(path.join(root,decodeURIComponent(u.pathname))).href)});
  const w=new BrowserWindow({width:1600,height:1000,show:false,webPreferences:{preload:path.join(__dirname,'..','..','desktop','preload.cjs'),contextIsolation:true,sandbox:true}});
  await w.loadURL('parity://app/app.html');
  const js=s=>w.webContents.executeJavaScript(`(async()=>{const p=ms=>new Promise(r=>setTimeout(r,ms));const wait=async f=>{for(let i=0;i<200;i++){if(f())return;await p(50)}throw Error('timeout')};${s}})()`);
  const shot=async n=>{await new Promise(r=>setTimeout(r,500));fs.writeFileSync(path.join(out,n+'.png'),(await w.webContents.capturePage()).toPNG());console.log('saved',n)};
  await js(`await wait(()=>document.body.innerText.length>50);const x=[...document.querySelectorAll('button,a')].find(b=>/Explore the calendar first/.test(b.textContent));if(x)x.click();await p(300);`);
  await shot('01-empty-calendar');
  await js(`const m=document.getElementById('mock');m.click();await wait(()=>document.querySelector('.tl .blk'));document.getElementById('viewport').scrollTop=0;`);
  await shot('02-schedule');
  await js(`document.querySelector('.blk.flagged[data-res]').click();await wait(()=>document.querySelector('.drawer'));`);
  await shot('03-drawer');
  await js(`document.querySelector('[data-view=week]').click();await wait(()=>document.querySelector('.week'));document.getElementById('close-drawer')&&document.getElementById('close-drawer').click();await p(200)`);
  await shot('04-week');
  await js(`location.hash='results';await wait(()=>document.querySelector('table tbody tr'));const f=document.querySelector('[data-filter=look]');if(f)f.click();await p(300)`);
  await shot('05-results');
  await js(`location.hash='agent';await p(800)`);
  await shot('06-agent');
  const ran=await js(`const b=[...document.querySelectorAll('button')].find(b=>/Run scheduling agent/.test(b.textContent));if(!b)return 'no button';b.click();for(let i=0;i<200;i++){if(/imported|complete|Done|reservations/i.test(document.getElementById('screen').innerText)&&!b.disabled)break;await p(100)}await p(800);return 'ok'`);
  console.log('agent run',ran);await shot('07-agent-run');
  app.exit(0);
});
