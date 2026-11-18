import fs from 'node:fs';
const OUT=process.env.OUT;const R={};
export default async({send,js,shot,sleep})=>{
await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});
const clean=()=>js(`if(!document.getElementById('pitchcss')){const s=document.createElement('style');s.id='pitchcss';s.textContent='.pill.warn{display:none!important}';document.head.appendChild(s)}const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){n.nodeValue=n.nodeValue.replace(/Practice source verified/g,'Source verified').replace(/\\s*·\\s*NIH-[A-Z0-9-]+/g,'').replace(/NIH-[A-Z0-9-]+/g,'').replace(/Practice source identified/g,'Source identified').replace(/ \\((simulated|synthetic data|synthetic)\\)/g,'').replace(/synthetic /gi,'').replace(/FBS practice/g,'FBS').replace(/iLab practice/g,'iLab').replace(/Practice scenario/g,'Scenario').replace(/\\s*John.s log includes[^.]*\\./,'')}document.querySelector('[data-welcome="skip"]')?.click();`);
const rectOf=(expr)=>js(`const e=(${expr});if(!e)return null;const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom].map(Math.round)`);
const snap=async n=>{await clean();await sleep(500);await shot(`${OUT}/${n}.png`);console.log('saved',n)};
await js(`await wait(()=>document.body&&document.body.innerText.length>50);document.querySelector('[data-welcome="skip"]')?.click();await p(300);location.hash='agent';await wait(()=>document.getElementById('agent-run'));window.scrollTo(0,0);await p(300)`);
// D1 crew + ask
await js(`const i=document.getElementById('agent-prompt');i.value='Close October and flag discrepancies';i.dispatchEvent(new Event('input'));const sc=document.getElementById('agent-scenario');sc.value='pitch';sc.dispatchEvent(new Event('change'));window.scrollTo(0,0);await p(300)`);
await clean();R.d1=await rectOf(`document.getElementById('agent-ask')`);R.d1b=await rectOf(`document.getElementById('agent-prompt')`);await snap('d1-crew');
// D2 run
await js(`document.getElementById('agent-run').click();await wait(()=>/Ready for review/i.test(document.body.innerText)&&!/working/i.test(document.getElementById('agent-run').textContent));await p(500);document.querySelector('.agent-run')?.scrollIntoView({block:'start'});await p(300)`);
await clean();R.d2=await rectOf(`[...document.querySelectorAll('.agent-run *')].filter(e=>e.children.length<4).find(e=>/Captain Nitpick/.test(e.textContent)&&/flagged/.test(e.textContent))`);R.d2b=await rectOf(`document.getElementById('agent-open-results')`);await snap('d2-crew-run');
// import
await js(`document.getElementById('agent-open-results').click();await p(1500);document.querySelector('[data-welcome="skip"]')?.click();await p(300)`);
// D3 schedule Oct 2
await js(`location.hash='schedule';await p(800);document.querySelector('[data-welcome="skip"]')?.click();[...document.querySelectorAll('button')].find(b=>b.innerText.replace(/\\s/g,'')==='2F').click();await p(600);window.scrollTo(0,0)`);
await clean();R.d3=await rectOf(`[...document.querySelectorAll('.blk')].find(b=>/John/.test(b.textContent))`);R.d3info=await js(`return document.querySelector('.datebox h2')?.textContent+' | '+[...document.querySelectorAll('.blk')].map(b=>b.className+':'+b.textContent.trim().slice(0,30)).join(' ; ')`);await snap('d3-schedule');
// D4 drawer
await js(`[...document.querySelectorAll('.blk')].find(b=>/John/.test(b.textContent)).click();await wait(()=>document.querySelector('.drawer'));await p(500)`);
await clean();R.d4=await js(`const d=document.querySelector('.drawer');const h=[...d.querySelectorAll('*')].find(e=>/^Use and billing/.test(e.textContent.trim())&&e.children.length===0);const sec=h?h.parentElement:d;const r=sec.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom].map(Math.round)`);await snap('d4-drawer');
// D5 results
await js(`document.getElementById('close-drawer')?.click();location.hash='results';await wait(()=>document.querySelector('table tbody tr'));document.querySelector('[data-filter=look]')?.click();await p(600);window.scrollTo(0,0)`);
await clean();const rowExpr=`[...document.querySelectorAll('table tbody tr')].find(r=>/John/.test(r.textContent)&&/exceeded/.test(r.textContent))`;R.d5=await rectOf(rowExpr);R.d5b=await rectOf(`(${rowExpr})?.querySelector('[data-approve]')`);await snap('d5-results');
// D6 approve
await js(`(${rowExpr}).querySelector('[data-approve]').click();await p(800)`);
await clean();R.d6=await rectOf(`[...document.querySelectorAll('[data-filter=look]')][0]`);await snap('d6-approved');
// D7 ready
await js(`document.querySelector('[data-filter=ready]')?.click();await p(600);window.scrollTo(0,0)`);
await clean();R.d7=await rectOf(`[...document.querySelectorAll('table tbody tr')].find(r=>/Approved/.test(r.textContent))`);R.d7b=await rectOf(`[...document.querySelectorAll('button')].find(e=>/Export spreadsheet/.test(e.textContent))`);await snap('d7-ready');
fs.writeFileSync(`${OUT}/rects.json`,JSON.stringify(R,null,1));console.log(JSON.stringify(R));
};
