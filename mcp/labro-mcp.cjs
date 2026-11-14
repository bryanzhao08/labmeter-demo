#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const M=require('../month.js'),I=require('../intake.js'),R=require('../ratesheet.js'),H=require('../helpers.js'),S=require('../schedule.js');
let version='0';try{version=require('../package.json').version}catch{}
const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?null:args[i+1]};
let base;
try {const folder=value('--folder');if(!folder||folder.startsWith('--'))throw Error();base=fs.realpathSync(folder);if(!fs.statSync(base).isDirectory())throw Error();}
catch {console.error('A valid directory is required: --folder <dir>');process.exit(2)}
const details=args.includes('--allow-details'),MAX=20*1024*1024,rx=/\.(csv|tsv|txt|xlsx|xls)$/i;
function safeRead(name){
  const target=fs.realpathSync(path.resolve(base,name)),rel=path.relative(base,target);
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('File is outside the selected folder.');
  if(!rx.test(target))throw Error('Unsupported file type.');
  const st=fs.statSync(target);if(!st.isFile()||st.size>MAX)throw Error('File is not readable or exceeds 20 MB.');
  return fs.readFileSync(target);
}
let profilePath=value('--rules');
if(args.includes('--rules')&&(!profilePath||profilePath.startsWith('--'))){console.error('A rules profile path is required after --rules.');process.exit(2)}
let savedRules;
// The rules file is named by whoever starts the server (never by a tool call), so it may sit outside the exports folder.
if(profilePath){try{const st=fs.statSync(profilePath);if(!st.isFile()||st.size>2*1024*1024)throw Error();savedRules=JSON.parse(fs.readFileSync(profilePath,'utf8'));if(!savedRules||typeof savedRules!=='object'||Array.isArray(savedRules))throw Error();}catch{console.error('Cannot read a valid rules profile at the --rules path.');process.exit(2)}}
function scan(){
  const files=[];
  function walk(dir,depth){let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
    for(const ent of entries){if(ent.name.startsWith('.')||ent.name.startsWith('~$')||ent.name==='node_modules')continue;
      const full=path.join(dir,ent.name);if(ent.isDirectory()){if(depth<2)walk(full,depth+1);continue}
      if(!ent.isFile()||!rx.test(ent.name))continue;
      try{const st=fs.statSync(full);if(st.size>0&&st.size<=MAX)files.push({name:path.relative(base,full),mtime:st.mtimeMs})}catch{}
    }
  }walk(base,0);files.sort((a,b)=>b.mtime-a.mtime||a.name.localeCompare(b.name));
  const entries=files.slice(0,200).map(f=>{try{
    const data=safeRead(f.name);let table;
    if(/\.xlsx?$/i.test(f.name)){const X=require('../vendor/xlsx.full.min.js'),book=X.read(data,{type:'buffer'});const sheet=book.Sheets[book.SheetNames[0]];const rows=X.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});table={head:(rows.shift()||[]).map(String),rows:rows.map(row=>row.map(String))};}
    else table=M.parseCSV(data.toString('utf8'));
    const info=I.classify(table);return {...f,table,info,kind:info.kind};
  }catch{return {...f,table:{head:[],rows:[]},info:{},kind:'error'}}});
  return I.pickDefaults(entries);
}
function state(){const entries=scan(),book=entries.find(e=>e.kind==='reservations'&&e.include),logs=entries.filter(e=>e.kind==='logs'&&e.include),price=entries.find(e=>e.kind==='prices'&&e.include);
  const parsed=price?R.parseRates([price.table.head,...price.table.rows]):null;
  const rules=savedRules||{basis:'union',evidence:'login',round_minutes:30,rates:{self:60,assisted:125,training:125},machine_rules:{},machines:[],machines_on:[],default_tier:'internal',rate_card:[],tiers:[]};
  if(!savedRules&&parsed)H.applyRateCard(rules,parsed);
  return {entries,book,logs,price,parsed,rules};
}
function displayName(entry,s){
  if(details)return entry.name;
  return 'File '+(s.entries.indexOf(entry)+1)+path.extname(entry.name).toLowerCase();
}
function analysis(s){if(!s.book)throw Error('No reservation export is in use.');if(!s.logs.length)throw Error('No usage log is in use.');const out=M.checkTables(s.rules,s.book.table,s.logs.map(l=>l.table));if(out.error)throw Error('The selected exports could not be checked; check their columns.');return {...out,summary:M.summary(out.rows,out.issues)};}
const date=d=>d==null?null:S.ymd(d);
const detail=r=>({date:date(r.day),machine:r.instrument,user:r.user,booked_minutes:r.booked,used_minutes:r.used,billed_minutes:r.billed,amount:r.amount,flags:r.flags});
function month(s,a){const by=new Map();for(const r of a.rows){let v=by.get(r.instrument);if(!v){v={machine:r.instrument,sessions:0,hours_billed:0,amount:0};by.set(r.instrument,v)}v.sessions++;v.hours_billed+=r.billed/60;v.amount+=r.amount}for(const v of by.values()){v.hours_billed=Math.round(v.hours_billed*100)/100;v.amount=Math.round(v.amount*100)/100}
 const x={...a.summary,totals_per_machine:[...by.values()]};if(details)x.session_details=a.rows.map(detail);return x;}
const schemas={find_exports:{type:'object',properties:{},additionalProperties:false},read_prices:{type:'object',properties:{},additionalProperties:false},check_month:{type:'object',properties:{},additionalProperties:false},sessions_needing_review:{type:'object',properties:{limit:{type:'number',minimum:0}},additionalProperties:false},test_report:{type:'object',properties:{},additionalProperties:false}};
const descriptions={
  find_exports:'List the spreadsheet and text files in the core facility\'s exports folder and say what each one is: a reservation export from the booking system (FBS, iLab, PPMS...), an instrument usage log, a price sheet, or unrecognised. Shows row counts, date range, column names, and which files LaBro will use. Call this first.',
  read_prices:'Read the price sheet in use and return the rate card: price per machine and service (self-service, assisted, training), rate tiers (internal, external, commercial), after-hours prices and hours, and the rounding step.',
  check_month:'Run the monthly billing check: match each reservation to logged instrument use, apply the billing rules and prices, and return how many sessions are ready to bill, how many need a person to look, the ready-to-bill total, counts per kind of problem, and totals per machine. Read-only; nothing is sent to a billing system.',
  sessions_needing_review:'List the sessions the month check flagged for a person to review (for example a no-show, use without a reservation, or an unusually long session). Returns counts only unless the server was started with --allow-details.',
  test_report:'Produce a plain-text diagnostic of what LaBro could read: file kinds, column names and counts. Contains no names, accounts or amounts, so it is safe to send to LaBro\'s developer.'
};
function run(name,args){if(!Object.hasOwn(schemas,name))throw Error('Unknown tool.');if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(schemas[name].properties,k)))throw Error('Invalid tool arguments.');if(name==='sessions_needing_review'&&args.limit!==undefined&&(!Number.isFinite(args.limit)||args.limit<0))throw Error('Limit must be a non-negative number.');
 const s=state();let result;
 if(name==='find_exports')result={files:s.entries.map(e=>({name:displayName(e,s),kind:e.kind,rows:e.table.rows.length,first_date:date(e.info.first),last_date:date(e.info.last),columns:e.table.head,in_use:!!e.include}))};
 if(name==='read_prices'){if(!s.parsed)throw Error('No price sheet is in use.');const p=s.parsed;result={items:p.items.map(i=>({machine:i.machine,service:i.mode,unit:i.unit,rates:i.rates,after_hours:i.after})),tiers:p.tiers,rounding_step:p.round_minutes,after_hours_window:p.after_hours,policy_notes:details?p.notes:[],unplaced_lines:p.unmatched.length};}
 if(name==='check_month')result=month(s,analysis(s));
 if(name==='sessions_needing_review'){const a=analysis(s);result=details?{sessions:a.rows.filter(r=>r.flags.length).slice(0,args.limit===undefined?undefined:Math.floor(args.limit)).map(detail),flag_counts:a.summary.flags}:{message:'Session details are off. Restart the server with --allow-details to see them.',flag_counts:a.summary.flags};}
 if(name==='test_report'){let a=null;try{a=analysis(s)}catch{}const res=s.book&&S.readReservations(s.book.table);result=I.buildReport({version,platform:process.platform,date:new Date().toISOString().slice(0,10),folderConnected:true,files:s.entries.map(e=>({kind:e.kind,include:e.include,rows:e.table.rows.length,columns:e.table.head,layout:e.info.layout,unread:e.info.unread})),reservations:res?{count:res.items.length,cancelled:res.cancelled,unread:res.issues.length,columns:s.book.table.head}:null,logs:s.logs.map(e=>({layout:e.info.layout,rows:e.table.rows.length,missing:[],columns:e.table.head})),prices:s.parsed?{items:s.parsed.items.length,tiers:s.parsed.tiers.map(t=>t.label),afterHours:!!s.parsed.after_hours,unplaced:s.parsed.unmatched.length}:null,analysis:a?{...a.summary,unreadable:a.summary.unreadableRows}:null});return {content:[{type:'text',text:result}]};}
 return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
}
function reply(id,result,error){const obj={jsonrpc:'2.0',id};if(error)obj.error=error;else obj.result=result;process.stdout.write(JSON.stringify(obj)+'\n')}
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let msg;try{msg=JSON.parse(line)}catch{reply(null,null,{code:-32700,message:'Parse error'});return}if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string'){reply(msg?.id??null,null,{code:-32600,message:'Invalid request'});return}if(!Object.hasOwn(msg,'id'))return;
 try{if(msg.method==='initialize'){const v=msg.params?.protocolVersion;reply(msg.id,{protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(v)?v:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'labro',version}})}
 else if(msg.method==='ping')reply(msg.id,{});
 else if(msg.method==='tools/list')reply(msg.id,{tools:Object.keys(schemas).map(name=>({name,description:descriptions[name],inputSchema:schemas[name],annotations:{readOnlyHint:true}}))});
 else if(msg.method==='tools/call'){try{reply(msg.id,run(msg.params?.name,msg.params?.arguments??{}))}catch(e){reply(msg.id,{isError:true,content:[{type:'text',text:e.message||'The tool could not complete.'}]})}}
 else reply(msg.id,null,{code:-32601,message:'Method not found'});
 }catch{reply(msg.id,null,{code:-32603,message:'Internal error'})}
});
