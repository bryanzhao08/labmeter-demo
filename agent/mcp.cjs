#!/usr/bin/env node
'use strict';
// Same stdio JSON-RPC transport as Parity's existing billing MCP. Practice data only.
const readline=require('node:readline'),{createRuntime}=require('./runtime.cjs');
const version=require('../package.json').version;
const tools=[
 {name:'parity_pull_practice_schedule',description:'Summon the local scheduling agent to pull a month from the FBS or iLab simulator. Returns a run ID; poll parity_practice_run_status. Synthetic data only. Does not import into the app or change bookings.',inputSchema:{type:'object',properties:{system:{type:'string',enum:['fbs','ilab']},month:{type:'string',pattern:'^20[0-9]{2}-(0[1-9]|1[0-2])$'},scenario:{type:'string',enum:['normal','retry','invalid']}},required:['system','month'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 {name:'parity_practice_run_status',description:'Read a scheduling-agent run, its steps, counts and synthetic reservation preview. No customer data or credentials are used.',inputSchema:{type:'object',properties:{run_id:{type:'string',pattern:'^[a-f0-9-]{36}$'}},required:['run_id'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
const respond=(id,result,error)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...(error?{error}:{result})})+'\n');
(async()=>{
 const runtime=await createRuntime(),rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 rl.on('line',line=>{
  let m;try{m=JSON.parse(line)}catch{return respond(null,null,{code:-32700,message:'Parse error'})}
  if(!m||m.jsonrpc!=='2.0'||typeof m.method!=='string')return respond(m?.id??null,null,{code:-32600,message:'Invalid request'});
  if(!Object.hasOwn(m,'id'))return;
  if(m.method==='initialize')return respond(m.id,{protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(m.params?.protocolVersion)?m.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'parity-scheduling-practice',version}});
  if(m.method==='ping')return respond(m.id,{});
  if(m.method==='tools/list')return respond(m.id,{tools});
  if(m.method!=='tools/call')return respond(m.id,null,{code:-32601,message:'Method not found'});
  try{
   const t=tools.find(t=>t.name===m.params?.name),args=m.params?.arguments||{};
   if(!t||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(t.inputSchema.properties,k))||t.inputSchema.required.some(k=>typeof args[k]!=='string'))throw Error('Invalid tool arguments.');
   if(t.name==='parity_practice_run_status'&&!/^[a-f0-9-]{36}$/.test(args.run_id))throw Error('Invalid run ID.');
   const result=t.name==='parity_pull_practice_schedule'?runtime.start(args):runtime.get(args.run_id);
   const output={mode:'synthetic',...result};
   respond(m.id,{content:[{type:'text',text:JSON.stringify(output)}],structuredContent:output});
  }catch(e){respond(m.id,{isError:true,content:[{type:'text',text:e.message}]})}
 });
 rl.on('close',async()=>{await runtime.close();process.exit(0)});
})().catch(e=>{process.stderr.write(e.message+'\n');process.exit(1)});
