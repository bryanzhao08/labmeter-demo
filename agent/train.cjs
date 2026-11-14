'use strict';
const fs=require('node:fs'),path=require('node:path'),{train,predict}=require('./mapper.cjs');
const aliases={
 id:['reservation id','booking id','reservation number','booking number','reservation identifier','booking identifier','res id','event id'],
 resource:['resource name','equipment name','instrument name','resource','equipment','instrument','facility resource','machine name'],
 user:['reserved by','booked by','user name','user full name','customer name','requested by','reservation owner','booking owner'],
 start:['start date time','start timestamp','start time','begin time','booking start','reservation start','begin timestamp','starts at'],
 end:['end date time','end timestamp','end time','finish time','booking end','reservation end','finish timestamp','ends at'],
 status:['reservation status','booking status','status','reservation state','booking state','event status','record status','current status'],
 lab:['lab name','research group','principal investigator','lab','group name','research lab','pi lab','customer lab'],
 account:['account code','billing account','funding code','account','grant code','project account','funding account','billing code'],
 service:['service type','reservation type','service','usage type','booking type','service mode','training service','instrument service'],
 tier:['user type','rate tier','customer type','membership type','affiliation type','pricing tier','customer tier','user affiliation']
};
const samples=Object.entries(aliases).flatMap(([label,list])=>list.map(text=>({text,label})));
// Held-out phrases do not appear verbatim in training. Synthetic only, no customer claims.
const heldout=Object.entries(aliases).flatMap(([label,list])=>[list[0]+' export',list[1]+' field'].map(text=>({text,label})));
const model=train(samples),predictions=heldout.map(s=>({...s,...predict(model,s.text)}));
const correct=predictions.filter((p,i)=>p.label===heldout[i].label).length;
const report={scope:'Synthetic headers only; no vendor access or real-data validation',trainingSamples:samples.length,heldoutSamples:heldout.length,correct,accuracy:correct/heldout.length,split:'Held-out header phrases; familiar vocabulary, not unseen institutions',failures:predictions.filter((p,i)=>p.label!==heldout[i].label)};
fs.writeFileSync(path.join(__dirname,'model/columns.json'),JSON.stringify(model,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'model/evaluation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
