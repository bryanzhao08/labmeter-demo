// Builds the simulated core month. Every name is invented (User A-H, John); nothing here is real data.
const fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'..','data','mock');
let seed=20261001;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296};
const pick=a=>a[Math.floor(rnd()*a.length)];
const pad=n=>String(n).padStart(2,'0');
const machines=['Flow cytometer 1','Flow cytometer 2','Cell sorter','Confocal microscope'];
const users=[['User A','Lab 1','PTA-0001','Internal'],['John','Lab 2','PTA-0002','Internal'],['User C','Lab 3','PTA-0003','Internal'],['User D','Lab 1','PTA-0001','Internal'],['User E','Lab 4','PTA-0004','External'],['User F','Lab 2','PTA-0002','Internal'],['User G','Lab 3','PTA-0003','Internal'],['User H','Lab 5','PTA-0005','Commercial']];
const serviceFor={'Cell sorter':['Assisted','Assisted','Self-service'],'Confocal microscope':['Self-service','Self-service','Training'],'Flow cytometer 1':['Self-service','Self-service','Assisted'],'Flow cytometer 2':['Self-service','Assisted','Self-service']};
const D=(y,m,d,h,mi)=>Date.UTC(y,m-1,d,h,mi)/60000;
const iso=min=>{const d=new Date(min*60000);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())};
const us=min=>{const d=new Date(min*60000);return {date:pad(d.getUTCMonth()+1)+'/'+pad(d.getUTCDate())+'/'+d.getUTCFullYear(),time:((d.getUTCHours()%12)||12)+':'+pad(d.getUTCMinutes())+' '+(d.getUTCHours()<12?'AM':'PM')}};
const res=[],logs=[];let id=40100;
function book(machine,u,s,e,opts={}){
  id++;const service=opts.service??pick(serviceFor[machine]);
  const r={id:'R'+id,machine,user:u[0],lab:u[1],account:opts.noAccount?'':u[2],tier:u[3],s,e,service,status:opts.status||'Confirmed'};res.push(r);return r;
}
function logIn(r,min,mode){logs.push([r.machine,r.user,min,'Login']);}
const queue=[];
const lastEnd=new Map();
function useSession(r,kind){queue.push([r,kind])}
function runSession(r,kind){
  if(r.status==='Cancelled')return;
  if(kind==='noshow')return;
  let s=r.s+Math.round((rnd()-.4)*10),e=r.e+Math.round((rnd()-.5)*20);
  const lk=r.machine+'|'+r.user,prev=lastEnd.get(lk);if(prev!=null&&s<=prev)s=prev+2;
  if(kind==='overrun')e=r.e+15+Math.floor(rnd()*4)*15;
  if(kind==='early')e=r.e-30-Math.floor(rnd()*2)*15;
  if(e<=s)e=s+30;lastEnd.set(lk,e);
  if(kind==='gap'){const mid=Math.round((s+e)/2);logs.push([r.machine,r.user,s,'Login']);logs.push([r.machine,r.user,mid,'Logout']);logs.push([r.machine,r.user,mid+25,'Login']);logs.push([r.machine,r.user,e,'Logout']);return}
  if(e<=s)e=s+30;
  lastEnd.set(lk,e);
  logs.push([r.machine,r.user,s,'Login']);
  if(kind==='repeat')logs.push([r.machine,r.user,s+6,'Login']);
  logs.push([r.machine,r.user,e,'Logout']);
}
const slots=[[8,10],[9,11],[10,12],[11,13],[13,15],[13,16],[14,16],[15,17],[9,12],[10,11]];
for(let d=1;d<=30;d++){
  const date=new Date(Date.UTC(2026,9,d)),dow=date.getUTCDay();
  if(dow===0)continue;
  for(const m of machines){
    if(dow===6){if(rnd()<.18){const u=pick(users);const r=book(m,u,D(2026,10,d,10,0),D(2026,10,d,12,0),{service:'Self-service'});useSession(r,'ok')}continue}
    let n=rnd()<.3?1:rnd()<.7?2:3,used=[];
    for(let i=0;i<n;i++){
      const sl=pick(slots);if(used.some(x=>x[0]<sl[1]&&sl[0]<x[1]))continue;used.push(sl);
      const u=pick(users);
      const r=book(m,u,D(2026,10,d,sl[0],0),D(2026,10,d,sl[1],0),{});
      const roll=rnd();
      useSession(r,roll<.62?'ok':roll<.72?'overrun':roll<.8?'noshow':roll<.86?'early':roll<.92?'repeat':'gap');
    }
    if(rnd()<.11){const u=pick(users);const r=book(m,u,D(2026,10,d,18,30),D(2026,10,d,21,0),{service:'Self-service'});useSession(r,'ok')}
  }
}
// Hand-placed cases a manager would want to see
const J=users[1];
const c1=book('Cell sorter',users[2],D(2026,10,13,14,0),D(2026,10,13,16,0),{status:'Cancelled',service:'Assisted'});
const c2=book('Confocal microscope',users[5],D(2026,10,20,9,0),D(2026,10,20,11,0),{status:'Cancelled',service:'Self-service'});
const na=book('Flow cytometer 2',users[0],D(2026,10,22,9,0),D(2026,10,22,11,0),{noAccount:true,service:'Self-service'});useSession(na,'ok');
const nm=book('Cell sorter',J,D(2026,10,15,9,0),D(2026,10,15,12,0),{service:''});useSession(nm,'ok');
// usage without any booking
logs.push(['Flow cytometer 1','User G',D(2026,10,27,16,0),'Login']);logs.push(['Flow cytometer 1','User G',D(2026,10,27,17,30),'Logout']);
// John's story: books 2 hours, uses a different 2 hours later the same day
const j1=book('Flow cytometer 1',J,D(2026,10,8,9,0),D(2026,10,8,11,0),{service:'Self-service'});
logs.push([j1.machine,j1.user,D(2026,10,8,13,0),'Login']);logs.push([j1.machine,j1.user,D(2026,10,8,15,0),'Logout']);
// one very long session on the confocal
const long=book('Confocal microscope',users[4],D(2026,10,31,9,0),D(2026,10,31,13,0),{service:'Self-service'});
logs.push([long.machine,long.user,D(2026,10,31,9,0),"Login"]);logs.push([long.machine,long.user,D(2026,10,31,23,0),"Logout"]);
queue.sort((a,b)=>a[0].s-b[0].s).forEach(([r,k])=>runSession(r,k));
res.sort((a,b)=>a.s-b.s||a.machine.localeCompare(b.machine));
const q=v=>/[",]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
let csv='Reservation ID,Resource,Reserved By,PI,Account,Start Date,Start Time,End Date,End Time,Status,Service Type,User Type\n';
for(const r of res){const a=us(r.s),b=us(r.e);csv+=[r.id,r.machine,r.user,r.lab,r.account,a.date,a.time,b.date,b.time,r.status,r.service,r.tier].map(q).join(',')+'\n'}
fs.writeFileSync(path.join(out,'fbs-reservations.csv'),csv);
logs.sort((a,b)=>a[2]-b[2]);
fs.writeFileSync(path.join(out,'usage-log.csv'),'Instrument,User Full Name,Timestamp,Record\n'+logs.map(l=>[l[0],l[1],iso(l[2]),l[3]].map(q).join(',')).join('\n')+'\n');
console.log('reservations',res.length,'log events',logs.length);
