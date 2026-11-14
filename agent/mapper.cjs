'use strict';
// A small supervised header classifier, trained only on synthetic column names.
const tokenize=s=>String(s).replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().match(/[a-z]+/g)||[];
function train(samples){
 const classes={},vocab=new Set();
 for(const {text,label} of samples){const c=classes[label]||(classes[label]={docs:0,total:0,words:{}});c.docs++;for(const t of tokenize(text)){vocab.add(t);c.words[t]=(c.words[t]||0)+1;c.total++}}
 return {type:'multinomial-naive-bayes',version:1,samples:samples.length,vocabulary:[...vocab].sort(),classes};
}
function predict(model,text){
 const tokens=tokenize(text),known=tokens.filter(t=>model.vocabulary.includes(t));
 if(!known.length)return {label:null,confidence:0};
 const scores=Object.entries(model.classes).map(([label,c])=>({label,score:Math.log(c.docs/model.samples)+known.reduce((s,t)=>s+Math.log(((c.words[t]||0)+1)/(c.total+model.vocabulary.length)),0)})).sort((a,b)=>b.score-a.score);
 const sum=scores.reduce((n,s)=>n+Math.exp(s.score-scores[0].score),0);
 return {label:scores[0].label,confidence:Math.round(10000/sum)/10000};
}
function mapColumns(model,headers){
 const mapping={},evidence=[];
 for(const [index,header] of headers.entries()){
  const p=predict(model,header);evidence.push({header,index,...p});
  if(!p.label||p.confidence<0.45)continue;
  if(mapping[p.label]!==undefined)throw Error('Ambiguous columns for '+p.label+'. Review the source export.');
  mapping[p.label]=index;
 }
 const missing=['id','resource','user','start','end','status'].filter(k=>mapping[k]===undefined);
 if(missing.length)throw Error('Column mapper needs review: '+missing.join(', ')+'. No records imported.');
 return {mapping,evidence};
}
module.exports={train,predict,mapColumns};
