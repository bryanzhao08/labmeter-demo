'use strict';
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),readline=require('node:readline'),path=require('node:path');
(async()=>{
 const child=spawn(process.env.PARITY_AGENT_MCP_BINARY||process.execPath,[process.env.PARITY_AGENT_MCP_SCRIPT||path.join(__dirname,'../agent/mcp.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}}),pending=new Map();let id=0,stderr='';child.stderr.on('data',b=>stderr+=b);
 readline.createInterface({input:child.stdout}).on('line',l=>{const m=JSON.parse(l);pending.get(m.id)?.(m);pending.delete(m.id)});
 const call=(method,params)=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>reject(Error(stderr||'MCP timeout')),10000);pending.set(n,m=>{clearTimeout(t);resolve(m)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n')});
 try{
  assert.equal((await call('initialize',{protocolVersion:'2025-06-18'})).result.serverInfo.name,'parity-scheduling-practice');
  const list=(await call('tools/list',{})).result.tools;assert.equal(list.length,2);assert.ok(list.every(t=>t.annotations.readOnlyHint));
  const start=(await call('tools/call',{name:list[0].name,arguments:{system:'ilab',month:'2026-10',scenario:'retry'}})).result.structuredContent;
  let r;for(let i=0;i<150;i++){r=(await call('tools/call',{name:list[1].name,arguments:{run_id:start.id}})).result.structuredContent;if(r.status!=='running')break;await new Promise(r=>setTimeout(r,20))}
  assert.equal(r.status,'ready',r.error);assert.equal(r.mode,'synthetic');assert.equal(r.counts.reservations,24);assert.ok(r.events.some(e=>e.tool==='retry'));
  assert.equal((await call('tools/call',{name:list[0].name,arguments:{system:'ilab',month:'2026-10',url:'https://example.com'}})).result.isError,true);
  console.log('PASS scheduling MCP: initialize, discover tools, summon iLab agent, poll complete records, reject URL injection');
 }finally{child.stdin.end();await new Promise(resolve=>child.on('exit',resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
