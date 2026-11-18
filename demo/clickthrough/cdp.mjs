// usage: node cdp.mjs port script.js  — script.js exports async function(step) using helpers
import fs from 'node:fs';
const port=process.argv[2],file=process.argv[3];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let t=[];
for(let i=0;i<60;i++){try{t=await (await fetch(`http://127.0.0.1:${port}/json`)).json();if(t.some(x=>/app\.html/.test(x.url)))break}catch{}await sleep(500)}
const pg=t.find(x=>/app\.html/.test(x.url));const ws=new WebSocket(pg.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{const n=++id;pend.set(n,r);ws.send(JSON.stringify({id:n,method,params}))});
const PRE="const p=ms=>new Promise(r=>setTimeout(r,ms));const wait=async f=>{for(let i=0;i<300;i++){if(f())return;await p(50)}throw Error('timeout')};";
const js=async s=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{${PRE}${s}})()`,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description||JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value};
const shot=async f=>{await sleep(500);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(f,Buffer.from(r.result.data,'base64'))};
const mod=await import(file);await mod.default({send,js,shot,sleep});ws.close();
