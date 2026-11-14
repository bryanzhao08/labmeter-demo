/* Pure helpers for the LaBro app: reading plain-language setup, per-machine rules and flags. */
(function(root){
'use strict';
const Rates=root.LBRates||(typeof require!=='undefined'?require('./ratesheet.js'):null);
const choices={booking_system:['Booked Scheduler','FBS','iLab','PPMS','Other'],instrument_type:['Flow cytometer','Confocal','NMR','Mass spectrometer','Other'],billing:['Booked plus used','Used only','Booked only','Acquisition time'],round_minutes:[30,15,1]};
const patterns={tier:/^(?:user type|affiliation|rate tier|customer type|tier|membership|member type)$/i,instrument:/^(resource|instrument|workstation|equipment)$/i,user:/^(owner|user full name|username|user|operator|customer name)$/i,start:/^(begin|start|login|logon time)$/i,end:/^(end|finish|logout|logoff time)$/i,lab:/^(lab|pi|group)$/i,account:/^(pta|account|worktag|grant)$/i,mode:/^(reservation type|reservation|service type|mode)$/i,timestamp:/^(timestamp|date and time)$/i,event:/^(record|event|action)$/i};
const fields={book:['instrument','user','start','end','lab','account','mode','tier'],use:['instrument','user','start','end','timestamp','event']};
function detectColumns(table,kind){const map=Object.fromEntries(fields[kind].map(k=>[k,table.head.findIndex(h=>patterns[k].test(String(h).trim()))]));const events=kind==='use'&&map.timestamp>=0&&map.event>=0;const required=['user',...(events?['timestamp','event']:['start','end']),...(kind==='book'?['instrument']:[])];return {map,events,format:table.rows.some(r=>r.some(v=>/^\d{1,2}\/\d{1,2}\//.test(String(v))))?'us':'iso',missing:required.filter(k=>map[k]<0)};}
const numWords={one:1,two:2,three:3,four:4,five:5,six:6};
const machineTerm=/\b(?:flow cytometers?|cytometers?|analy[sz]ers?|cell sorters?|sorters?|confocals?(?:\s+microscopes?)?|microscopes?|light[- ]sheet|two[- ]photon|nmr(?:\s+spectrometers?)?|mass spectrometers?|spectrometers?|plate readers?|sequencers?|q?pcr(?:\s+machines?)?|centrifuges?|incubators?|imagers?|scanners?|cytoflex|aria|fortessa|symphony|celesta|novocyte|orbitrap|avance|lsm\s?\d+)\b(?!\s+(?:core|facility))/i;
function extractMachines(text){const out=[],seen=new Set();for(const sentence of String(text||'').split(/[.!?\n]+/)){if(!machineTerm.test(sentence))continue;for(let piece of sentence.split(/,|;|&|\band\b|\bplus\b/i)){if(!machineTerm.test(piece))continue;piece=piece.replace(/^.*\b(?:have|has|had|run|runs|operate|operates|offer|offers|includes?|including|with|got)\b\s+/i,'').replace(/\s+(?:at|for|in|on|that|which|by|is|are|was|were|gets?|bills?|billed|booked|charged|costs?)\b.*$/i,'').replace(/[^\w\s\-+\/]/g,' ').replace(/\s+/g,' ').trim();let n=1;for(let i=0;i<3;i++){piece=piece.replace(/^(?:also|a|an|the|our|some|about|around)\s+/i,'');const m=piece.match(/^(\d+|one|two|three|four|five|six)\s+/i);if(m){n=Math.min(6,+m[1]||numWords[m[1].toLowerCase()]);piece=piece.slice(m[0].length)}}if(!piece||piece.split(' ').length>5||!machineTerm.test(piece))continue;let name=piece.replace(/^\w/,c=>c.toUpperCase());if(n>1&&!/ss$/i.test(name))name=name.replace(/s$/i,'');const names=n>1?Array.from({length:n},(_,i)=>name+' '+(i+1)):[name];for(const x of names){const key=x.toLowerCase();if(!seen.has(key)){seen.add(key);out.push(x)}}}}return out.slice(0,20)}
const billingPhrases=[[/acquisition time/,'Acquisition time'],[/used only|actual (?:time|use|usage)|only (?:what|the time) (?:they|it) (?:actually )?used?|actually used/,'Used only'],[/booked only|booked time only|booked time/,'Booked only'],[/booked (?:plus|and) used|overruns?|larger of|whichever is (?:longer|larger)/,'Booked plus used']];
function machineRulesFrom(text,machines){const out={};for(const sentence of String(text||'').split(/[.!?\n]+/)){const s=sentence.toLowerCase();let label='';for(const [rx,l] of billingPhrases)if(rx.test(s)){label=l;break}const round=s.match(/(?:round(?:ed|ing)?\s*(?:up)?\s*(?:to|in)?|in)\s*(30|15|1)[- ]*min/);if(!label&&!round)continue;for(const m of machines||[]){const base=m.toLowerCase().replace(/\s*\d+$/,'').replace(/s$/,'').split(' ').pop();if(base.length<3||!s.includes(base))continue;out[m]={...out[m],...(label?{billing:label}:{}),...(round?{round_minutes:+round[1]}:{})}}}return out}
function ratesFrom(text){const rates={};const rx=/(self[- ]?serv\w*|assisted|staff[- ]assisted|training)[^$\d\n]{0,30}\$\s?(\d+(?:\.\d{1,2})?)|\$\s?(\d+(?:\.\d{1,2})?)\s*(?:\/|per)\s*(?:hr|hour)[^\n]{0,20}?(self[- ]?serv\w*|assisted|training)/gi;let m;while((m=rx.exec(String(text||'')))){const k=(m[1]||m[4]).toLowerCase(),v=+(m[2]||m[3]),key=/^self/.test(k)?'self':/train/.test(k)?'training':'assisted';if(!(key in rates))rates[key]=v}return rates}
function keywordParser(text,base){const p=JSON.parse(JSON.stringify(base));const s=String(text).toLowerCase();for(const [rx,val] of [[/booked scheduler/,'Booked Scheduler'],[/\bfbs\b/,'FBS'],[/\bilab\b/,'iLab'],[/\bppms\b/,'PPMS']])if(rx.test(s)){p.booking_system=val;break}for(const [rx,val] of [[/flow cytom/,'Flow cytometer'],[/confocal/,'Confocal'],[/\bnmr\b/,'NMR'],[/mass spectrom/,'Mass spectrometer']])if(rx.test(s)){p.instrument_type=val;break}if(/acquisition time/.test(s)){p.basis='actual';p.evidence='acquisition'}else if(/used only|actual only/.test(s))p.basis='actual';else if(/booked only/.test(s))p.basis='booked';else if(/booked (plus|and) used|overruns/.test(s))p.basis='union';const round=s.match(/(?:round(?:ed|ing)?\s*(?:up)?\s*(?:to|in)?|in)\s*(30|15|1)[- ]*min/);if(round)p.round_minutes=+round[1];const name=String(text).match(/(?:we(?:'re| are)|this is)\s+(?:the\s+)?([^.!\n]{3,80}?)(?:\s+at\s+|[.!\n]|$)/i);if(name)p.lab_name=name[1].trim().replace(/^\w/,c=>c.toUpperCase());p.notes=String(text).trim();const found=extractMachines(text);if(found.length){p.machines=found;p.machines_on=found.slice()}const mr=machineRulesFrom(text,p.machines_on||p.machines||[]);if(Object.keys(mr).length)p.machine_rules={...(p.machine_rules||{}),...mr};const rt=ratesFrom(text);for(const k of Object.keys(rt))p.rates[k]=rt[k];return p;}
function validateModel(candidate,base){const p=JSON.parse(JSON.stringify(base));if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return p;for(const k of ['booking_system','instrument_type','round_minutes'])if(choices[k].includes(candidate[k]))p[k]=candidate[k];for(const [k,allowed] of Object.entries({basis:['union','actual','booked'],evidence:['login','acquisition']}))if(allowed.includes(candidate[k]))p[k]=candidate[k];if(Array.isArray(candidate.machines)){const names=[...new Set(candidate.machines.filter(x=>typeof x==='string'&&x.trim()&&x.length<60).map(x=>x.trim()))].slice(0,20);if(names.length){p.machines=names;p.machines_on=names.slice()}}for(const k of ['lab_name','notes'])if(typeof candidate[k]==='string'&&candidate[k].trim()&&candidate[k].length<1000)p[k]=candidate[k].trim();for(const k of ['self','assisted','training'])if(typeof candidate.rates?.[k]==='number'&&Number.isFinite(candidate.rates[k])&&candidate.rates[k]>=0)p.rates[k]=candidate.rates[k];return p;}
function setBilling(p,v){p.basis=v==='Booked only'?'booked':v==='Used only'||v==='Acquisition time'?'actual':'union';p.evidence=v==='Acquisition time'?'acquisition':'login'}
const tierKey=(text,known)=>{const t=String(text||'').trim().toLowerCase();if(!t)return '';if(known&&known.includes(t))return t;if(/commercial|industry|for[- ]?profit|corporate/.test(t))return 'commercial';if(/external|outside|academic|non[- ]?profit/.test(t))return 'external';if(/internal|campus|member|university|home/.test(t))return 'internal';return t};
function policyFor(profile,instrument){
  const keys=Object.keys(profile.machine_rules||{}),match=Rates.matchNames(keys,instrument),key=match.names[0],rule=profile.machine_rules?.[key]||{};
  const p={basis:profile.basis,evidence:profile.evidence,round:profile.round_minutes,rates:{...profile.rates,...rule.rates},defaultTier:profile.default_tier||'internal'};
  if(choices.billing.includes(rule.billing))setBilling(p,rule.billing);
  if(rule.round_minutes!=null&&rule.round_minutes!=='')p.round=Number(rule.round_minutes);
  const cardMatch=Rates.matchNames((profile.rate_card||[]).filter(i=>i.hourly!==false).map(i=>i.machine),instrument);
  if(match.ambiguous||cardMatch.ambiguous)p.machineMatchAmbiguous=true;
  const items=Rates.itemsFor(profile.rate_card,instrument);
  if(items.length){
    const known=(profile.tiers||[]).map(t=>t.key);
    p.rateFor=(mode,tier,after)=>{if(rule.rates&&rule.rates[mode]!=null&&!after)return Number(rule.rates[mode]);const v=Rates.rateFor(items,mode,tierKey(tier,known)||p.defaultTier,after);return Number.isFinite(v)?v:Number(p.rates[mode])};
    if(items.some(i=>Object.keys(i.after||{}).length))p.afterHours=profile.after_hours||{start:18,end:9,weekends:true};
  }
  return p;
}
function outliers(rows){if(rows.length<8)return [];const median=a=>{const v=a.slice().sort((x,y)=>x-y),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2},med=median(rows.map(r=>r.billed)),mad=median(rows.map(r=>Math.abs(r.billed-med)));return mad>0?rows.filter(r=>0.6745*(r.billed-med)/mad>3.5&&r.billed>=2*med):[]}
function flagKind(text){if(/Use exceeded the booked time|Booking without observed use|Overlapping use|Cross-midnight/i.test(text))return 'time';if(/Missing or multiple labs|Missing or multiple funding accounts|Usage without a matching booking or identity|Instrument could not be identified|Select one service type|Mixed rate tiers/i.test(text))return 'who';if(/Unusually long|alert amount/i.test(text))return 'unusual';return 'data'}
const machineNorm=x=>String(x||'').trim().toLowerCase().replace(/\s*\d+$/,'').replace(/s$/,'');
// One entry per machine: drop repeats that differ only in case, plural or number, and described names a price sheet already covers.
function dedupeMachines(list,authoritative){
  const auth=(authoritative||[]).map(machineNorm),out=[],seen=[];
  for(const m of list||[]){const n=machineNorm(m);if(!n)continue;
    if(seen.includes(n))continue;
    if(auth.some(a=>a!==n&&(a.includes(n)||n.includes(a))))continue;
    seen.push(n);out.push(m)}
  return out;
}
const MODE_NAME={self:'Self-service',assisted:'Assisted',training:'Training',any:'Any service'};
function applyRateCard(draft,parsed){
  const hourlyItems=parsed.items.filter(i=>i.hourly!==false);
  draft.rate_card=parsed.items;draft.tiers=parsed.tiers;
  if(parsed.after_hours)draft.after_hours={start:parsed.after_hours.start,end:parsed.after_hours.end,weekends:parsed.after_hours.weekends};
  if(parsed.round_minutes&&choices.round_minutes.includes(parsed.round_minutes))draft.round_minutes=parsed.round_minutes;
  draft.price_notes=parsed.notes;
  const names=[...new Set(hourlyItems.map(i=>i.machine).filter(Boolean))];
  if(names.length){const before=draft.machines_on||[];draft.machines=dedupeMachines([...names,...(draft.machines||[])],names);draft.machines_on=draft.machines.filter(m=>names.includes(m)||before.some(b=>machineNorm(b)===machineNorm(m)))}
  for(const i of hourlyItems)if(!i.machine)for(const m of ['self','assisted','training']){if(i.mode===m&&i.rates.internal!=null)draft.rates[m]=i.rates.internal}
  if(!(draft.tiers||[]).some(t=>t.key===draft.default_tier))draft.default_tier=(draft.tiers[0]||{key:'internal'}).key;
  return draft;
}

const API={detectColumns,keywordParser,validateModel,extractMachines,machineRulesFrom,ratesFrom,policyFor,outliers,flagKind,applyRateCard,dedupeMachines,machineNorm,setBilling,tierKey,choices,fields,MODE_NAME};
root.LBHelpers=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
