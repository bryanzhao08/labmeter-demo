'use strict';
const NOTES = /* NOTES_INSERT */;
const C={paper:'#F3F1E8',ink:'#1C292B',mineral:'#698782',pale:'#D8E3DD',red:'#D6553A',yellow:'#E9BE47',white:'#FFFFFF',muted:'#4E6664'};
const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const fill=h=>[{type:'SOLID',color:rgb(h)}];
let F={};
async function fonts(){
 const available=await figma.listAvailableFontsAsync();
 const pick=(families,styles)=>{for(const family of families)for(const style of styles){const f=available.find(x=>x.fontName.family===family&&x.fontName.style===style);if(f)return f.fontName;}return null};
 F.head=pick(['Big Shoulders Display','Big Shoulders','Arial','Inter'],['Bold','SemiBold','Regular']);
 F.body=pick(['Schibsted Grotesk','Arial','Inter'],['Regular','Medium','Bold']);
 F.mono=pick(['DM Mono','Roboto Mono','Arial','Inter'],['Regular','Medium']);
 if(!F.head||!F.body||!F.mono)throw Error('A usable font is unavailable. Install the requested fonts or enable Arial/Inter in Figma.');
 for(const f of [F.head,F.body,F.mono])await figma.loadFontAsync(f);
}
function box(s,x,y,w,h,color,r=0){const n=figma.createRectangle();s.appendChild(n);n.x=x;n.y=y;n.resize(w,h);n.fills=fill(color);n.cornerRadius=r;return n;}
function txt(s,value,x,y,w,size=36,color=C.ink,font=F.body){
 const n=figma.createText();s.appendChild(n);n.fontName=font;n.fontSize=size;n.lineHeight={unit:'PERCENT',value:112};n.characters=value;n.fills=fill(color);n.textAutoResize='HEIGHT';n.resize(w,100);n.x=x;n.y=y;return n;
}
function line(s,x,y,w,h,color=C.ink){return box(s,x,y,w,h,color,Math.min(w,h)/2)}
function circ(s,x,y,d,color){const n=figma.createEllipse();s.appendChild(n);n.x=x;n.y=y;n.resize(d,d);n.fills=fill(color);return n;}
function label(s,t,x,y,color=C.muted){return txt(s,t.toUpperCase(),x,y,500,30,color,F.mono)}
function base(s,index,kicker,title,subtitle){
 s.fills=fill(C.paper);box(s,0,0,18,1080,C.red);label(s,kicker,92,70,C.red);txt(s,title,90,125,1710,82,C.ink,F.head);
 if(subtitle)txt(s,subtitle,94,232,1660,36,C.muted);
 line(s,92,1000,1734,2,C.ink);txt(s,'LABRO   /   SHARED LAB OPERATIONS',94,1017,850,30,C.muted,F.mono);txt(s,String(index).padStart(2,'0'),1730,1017,95,30,C.muted,F.mono);
}
function card(s,x,y,w,h,title,body,accent=C.mineral){box(s,x,y,w,h,C.white,18);box(s,x,y,9,h,accent,4);txt(s,title,x+34,y+28,w-68,40,C.ink,F.head);txt(s,body,x+34,y+92,w-68,32,C.muted);}
function node(s,x,y,w,t,accent=C.mineral){box(s,x,y,w,114,C.white,12);box(s,x,y,9,114,accent,3);txt(s,t,x+28,y+33,w-50,34,C.ink,F.body);}
function arrow(s,x,y){line(s,x,y,65,4,C.mineral);box(s,x+58,y-7,17,17,C.mineral,3).rotation=45;}
function microscope(s,x,y){
 // Editable vector schematic; deliberately not represented as a photograph.
 box(s,x+76,y+338,360,26,C.ink,13);box(s,x+170,y+300,135,26,C.ink,9);box(s,x+210,y+115,48,193,C.mineral,16).rotation=-18;
 box(s,x+176,y+75,165,53,C.ink,12).rotation=22;box(s,x+122,y+35,110,35,C.ink,9).rotation=22;
 circ(s,x+315,y+160,98,C.yellow);circ(s,x+338,y+183,52,C.paper);box(s,x+43,y+250,330,20,C.ink,8);box(s,x+90,y+270,25,72,C.ink,8);box(s,x+300,y+265,25,72,C.ink,8);
 label(s,'MICROSCOPE · SCHEMATIC',x+40,y+410,C.muted);
}
function timeline(s){
 const x=240,y=435,span=1350;line(s,x,y+230,span,5,C.ink);const marks=[['9:00',0],['11:00',.5],['12:30',.875],['1:00',1]];
 for(const [v,p] of marks){circ(s,x+span*p-8,y+222,20,C.ink);txt(s,v,x+span*p-55,y+258,150,32,C.ink,F.mono)}
 const rows=[['BOOKED',0,.5,C.mineral],['EXPERIMENT',0,.875,C.yellow],['LOGIN / COPY',0,1,C.red]];
 rows.forEach((a,i)=>{txt(s,a[0],90,y+i*68,240,31,C.muted,F.mono);box(s,x,y+i*68,span*a[2],44,a[3],10)});
}
function schematicUI(s){
 box(s,1020,335,745,550,C.white,18);box(s,1020,335,745,64,C.ink,18);txt(s,'REVIEW WORKFLOW · SCHEMATIC',1050,350,680,30,C.white,F.mono);
 [['01','Import exports'],['02','Compare intervals'],['03','Review flagged session'],['04','Export charges']].forEach((r,i)=>{const y=425+i*95;circ(s,1055,y,54,i===2?C.red:C.pale);txt(s,r[0],1065,y+9,55,30,C.ink,F.mono);txt(s,r[1],1130,y+7,530,36,C.ink);if(i<3)line(s,1081,y+55,3,40,C.mineral)});
}
function display(s,i){
 switch(i){
 case 0: base(s,1,'SHARED LABS','LaBro','A clearer path from equipment use to billing');microscope(s,1190,365);txt(s,'Research runs on shared equipment.\nManagers make the final call.',100,440,900,52,C.ink);break;
 case 1: base(s,2,'THE INCIDENT','A booking is not the whole experiment','Simulated example · the manager sees a booking and a login');timeline(s);break;
 case 2: base(s,3,'THE WORKFLOW','Turn exports into a reviewable month','Simulated data · product workflow');txt(s,'Bring the records together.\nMake exceptions visible.',100,415,770,62,C.ink,F.head);schematicUI(s);break;
 case 3: base(s,4,'REVIEW AND TIME','Evidence first, then a billing decision','The manager reviews exceptions; unreadable rows require correction');node(s,115,450,430,'Booking + login');arrow(s,565,505);node(s,650,450,430,'Flagged interval',C.red);arrow(s,1100,505);node(s,1185,450,500,'Manager decision',C.yellow);txt(s,'Pilot measure',115,700,380,32,C.muted,F.mono);txt(s,'Reconciliation time',115,748,950,54,C.ink,F.head);break;
 case 4: base(s,5,'CAMPUS DISCOVERY','Conversations shaped the workflow','Conversations with researchers and facility staff');const ca=figma.createVector();s.appendChild(ca);ca.vectorPaths=[{windingRule:'NONZERO',data:'M 0 0 L 300 0 L 300 240 L 535 500 L 370 500 L 195 425 L 90 260 Z'}];ca.x=230;ca.y=360;ca.fills=fill(C.pale);[['STANFORD',400,525,850,470],['CALTECH',620,740,850,635],['USC',605,770,850,790]].forEach(([t,x,y,lx,ly])=>{circ(s,x-12,y-12,24,C.red);line(s,x+18,y-2,785-x,3,C.mineral);line(s,800,Math.min(y,ly+22),3,Math.max(3,Math.abs(y-ly-22)),C.mineral);line(s,800,ly+20,32,3,C.mineral);txt(s,t,lx,ly,550,40,C.ink,F.head)});break;
 case 5: base(s,6,'PROPOSED PRICING','Two ways to adopt LaBro','Pilot feedback will shape scope and willingness to pay');card(s,120,370,730,420,'CORE PLAN','$199 / month\nPer shared lab or core',C.mineral);card(s,970,370,730,420,'CAMPUS PLAN','$160,000 / year\nBroader deployment and support',C.red);break;
 case 6: base(s,7,'ESTIMATED MARKET','A market built from explicit assumptions','US estimate · annual subscription revenue');card(s,100,360,790,445,'US TOTAL  ·  $35.82M','15,000 assumed cores\n× $199 / month × 12',C.mineral);card(s,990,360,790,445,'INITIAL SERVICEABLE  ·  $22.33M','187 assumed R1 universities\n× 50 cores × $199 / month × 12',C.red);break;
 case 7: base(s,8,'GROWTH SCENARIO','From core pilot to campus plans','A standalone campus-plan scenario · not added to core subscriptions');[['CORE PILOT',180],['CAMPUS',745],['MORE UNIVERSITIES',1310]].forEach(([t,x],j)=>{circ(s,x,380,112,[C.mineral,C.red,C.yellow][j]);txt(s,t,x-35,530,480,40,C.ink,F.head);if(j<2)arrow(s,x+170,435)});txt(s,'60 × $160,000 = $9.6M ARR',180,760,1450,60,C.ink,F.head);break;
 case 8: base(s,9,'PILOT INVITATION','Help us put LaBro to work','Seeking shared lab managers with reservation and usage exports');microscope(s,1190,365);txt(s,'Test the evidence.\nMeasure the time.\nShape campus deployment.',100,405,900,54,C.ink,F.head);break;
 case 9: base(s,10,'APPENDIX 01','Integration boundaries','Existing files in · reviewed files out');
   label(s,'INPUT',115,350,C.red);label(s,'LOCAL REVIEW',760,350,C.red);label(s,'OUTPUT',1380,350,C.red);
   node(s,115,415,495,'FBS / iLab exports');node(s,115,565,495,'Equipment logs');arrow(s,640,545);
   node(s,740,490,490,'Rules + matching',C.red);arrow(s,1260,545);node(s,1360,490,430,'Reviewed charges',C.yellow);
   txt(s,'Optional equipment data · no reservation sync',115,800,1550,34,C.muted);break;
 case 10: base(s,11,'APPENDIX 02','Architecture','Local-first desktop · no required server or database');
   [['01','Electron 45.2.3','Sandboxed HTML / CSS / JavaScript renderer'],['02','Preload IPC → Node main','Files, safeStorage credentials and native services'],['03','SheetJS 0.20.3','CSV / XLS / XLSX import'],['04','Shared engines','month.js + reconcile-engine.js'],['05','Local persistence','Browser storage and profile files']].forEach((r,i)=>{
     const y=338+i*115;line(s,110,y+95,1695,2,C.pale);txt(s,r[0],115,y+13,85,31,C.red,F.mono);txt(s,r[1],230,y+4,540,42,C.ink,F.head);txt(s,r[2],800,y+12,980,33,C.muted);
   });break;
 case 11: base(s,12,'APPENDIX 03','MCP connection','Local stdio · read-only tools');
   box(s,110,335,1050,515,C.ink,15);label(s,'FIVE TOOLS',145,370,C.yellow);
   ['find_exports','read_prices','check_month','sessions_needing_review','test_report'].forEach((t,i)=>txt(s,t,150,430+i*75,940,36,C.white,F.mono));
   txt(s,'AGGREGATE BY DEFAULT',1230,375,570,36,C.ink,F.head);txt(s,'Details require opt-in',1230,430,570,32,C.muted);
   line(s,1230,505,500,3,C.mineral);txt(s,'INCOMPLETE INPUT',1230,560,570,36,C.ink,F.head);txt(s,'Unreadable rows are counted and flagged',1230,615,560,32,C.muted);break;
 case 12: base(s,13,'APPENDIX 04','Validation and limits','What works now and what the pilot must establish');
   label(s,'TESTED',115,345,C.red);txt(s,'17 automated test suites',115,405,710,50,C.ink,F.head);txt(s,'Desktop smoke test passed',115,480,710,36,C.muted);
   line(s,1000,350,3,465,C.mineral);label(s,'TO VERIFY',1060,345,C.red);txt(s,'Real facility exports',1060,405,700,44,C.ink,F.head);txt(s,'Evidence usefulness · reconciliation time\nCampus rollout and deployment needs',1060,480,710,34,C.muted);
   box(s,115,740,700,75,C.pale,8);txt(s,'Packaging in progress',145,758,640,32,C.ink,F.mono);break;
 case 13: base(s,14,'APPENDIX 05','Market and growth math','Estimates and scenarios, not forecasts');txt(s,'15,000 × $199 × 12  =  $35.82M',130,395,1570,50,C.ink,F.head);txt(s,'187 × 50 × $199 × 12  =  $22.33M',130,545,1570,50,C.ink,F.head);txt(s,'60 × $160,000  =  $9.6M ARR',130,695,1570,50,C.ink,F.head);line(s,130,485,1500,3,C.mineral);line(s,130,635,1500,3,C.mineral);break;
 }
}
async function main(){
 if(figma.editorType!=='slides')throw Error('Open a Figma Slides deck before running this plugin.');
 await fonts();
 const row=figma.createSlideRow();row.name='LaBro v6';
 const appendix=['FBS and iLab exports enter as files, alongside optional equipment logs. There is no reservation synchronization. Reviewed charges are exported.','Electron 45.2.3 hosts a sandboxed HTML, CSS and JavaScript renderer. Preload IPC connects to Node main. SheetJS 0.20.3 reads spreadsheets and CSV; shared month.js and reconcile-engine.js perform matching. safeStorage protects credentials; profiles use browser storage and local files. No server or database is required.','Five local stdio read-only tools provide aggregate output by default. Details require opt-in. An incomplete check identifies unreadable rows.','Seventeen automated test suites passed and the desktop smoke test passed. Packaging is in progress. Pilot work must verify real exports, usefulness, time and deployment requirements.','Annualized core estimates and a separate campus scenario; assumptions require validation.'];
 for(let i=0;i<14;i++){
  const slide=figma.createSlide();row.appendChild(slide);slide.name=(i<9?'LaBro v6 · ':'LaBro v6 appendix · ')+String(i+1).padStart(2,'0');
  display(slide,i);
  const note=txt(slide,i<9?NOTES[i]:appendix[i-9],80,80,1500,30,C.ink);note.name='Presenter notes · copy to Slides notes';note.visible=false;
 }
 figma.notify('Added LaBro v6: 9 main slides and 5 appendix slides. Copy hidden notes into presenter notes.');
 figma.closePlugin();
}
main().catch(e=>figma.closePlugin('LaBro v6 could not finish: '+String(e.message||e)));
