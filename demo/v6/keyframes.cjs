// Exports clean 3D keyframes (no captions or labels) used as start/end frames for AI video shots.
const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path');
app.whenReady().then(async()=>{const w=new BrowserWindow({width:1920,height:1080,show:false,useContentSize:true,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
 await w.loadFile(path.join(__dirname,'film.html'));await w.webContents.executeJavaScript('window.ready');
 const out=path.join(__dirname,'keyframes');fs.mkdirSync(out,{recursive:true});
 const shots=await w.webContents.executeJavaScript(`(()=>{window.NO_OVERLAY=true;const c=document.getElementById('out'),r={};for(const t of [0.05,3.4,3.5,5.45]){window.renderAt(t);r[t]=c.toDataURL('image/jpeg',.95).split(',')[1]}return r})()`);
 for(const [t,b] of Object.entries(shots))fs.writeFileSync(path.join(out,'kf-'+t+'.jpg'),Buffer.from(b,'base64'));console.log('KEYFRAMES',Object.keys(shots).join(','));app.exit(0)});
