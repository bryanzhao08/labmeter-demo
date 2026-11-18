// Drives the running desktop app over CDP (start it with --remote-debugging-port=9333) and saves
// stills of the scheduling agent run and the MCP connector. Run: node demo/v6/capture-agent.mjs
import fs from 'node:fs';
import path from 'node:path';
const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'stills');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if (targets.some(t => /app\.html/.test(t.url))) break } catch {} await sleep(500) }
const page = targets.find(t => /app\.html/.test(t.url)); if (!page) throw Error('app page not found');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } };
const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) });
const js = async src => { const r = await send('Runtime.evaluate', { expression: `(async()=>{const p=ms=>new Promise(r=>setTimeout(r,ms));const wait=async f=>{for(let i=0;i<400;i++){if(f())return;await p(50)}throw Error('timeout')};${src}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value };
const clean = () => js(`const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){n.nodeValue=n.nodeValue.replace(/Practice source identified\\./,'Source identified.').replace(/ \\(synthetic data\\)/g,'').replace(/synthetic /gi,'').replace(/FBS practice/g,'FBS').replace(/iLab practice/g,'iLab').replace(/\\s*John.s log includes[^.]*\\./,'')}for(const t of document.querySelectorAll('textarea'))t.value=t.value.replace(/\\/Users\\/[^"]*?\\/(node_modules\\/electron\\/dist\\/Electron\\.app|desktop\\/web)/g,(m,x)=>x.startsWith('node')?'/Applications/Parity.app/Contents/MacOS/Parity':'/Applications/Parity.app/Contents/Resources/app').replace('/Contents/MacOS/Parity/Contents/MacOS/Electron','/Contents/MacOS/Parity');`);
const rects = {};
const grab = (n, sel) => js(`return [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return [r.left*2,r.top*2,r.right*2,r.bottom*2,e.textContent.trim().slice(0,40)]})`).then(v => { rects[n] = v });
const shot = async n => { await clean(); await sleep(600); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, n + '.png'), Buffer.from(r.result.data, 'base64')); console.log('saved', n) };
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 953, deviceScaleFactor: 2, mobile: false });
// Pitch capture: hide the practice-data pill and the welcome dialog.
await js(`await wait(()=>document.body&&document.body.innerText.length>50);const s=document.createElement('style');s.textContent='.pill.warn{display:none!important}';document.head.appendChild(s);const k=document.querySelector('[data-welcome="skip"]');if(k)k.click();await p(300)`);
await js(`location.hash='agent';await wait(()=>document.getElementById('agent-run'));const sc=document.getElementById('agent-scenario');sc.value='retry';sc.dispatchEvent(new Event('change'));document.getElementById('agent-run').click();await wait(()=>/Ready for review|Rejected|Failed/.test(document.body.innerText)&&!/Agent working/.test(document.body.innerText));await p(400);document.querySelector('.agent-run')?.scrollIntoView({block:'start'});`);
await shot('08-agent-run');await grab('events','.agent-events li');await grab('preview','.agent-preview .hint, .agent-preview table');
await js(`const d=[...document.querySelectorAll('.agent-run details')][0];if(d){d.open=true;await p(200);d.scrollIntoView({block:'start'})}`);
await shot('09-agent-mapping');await grab('mapping','.agent-run details table tbody tr');
await js(`location.hash='connect';await p(800);const h=[...document.querySelectorAll('h2')].find(h=>/MCP connector/.test(h.textContent));if(h)h.scrollIntoView({block:'start'});await p(300)`);
await shot('10-mcp');await grab('mcp','button, textarea, .banner, h2, h3, ol li, label');
fs.writeFileSync(path.join(out,'rects.json'),JSON.stringify(rects));
ws.close();
