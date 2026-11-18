import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/addons/RoundedBoxGeometry.js';

const W=1920,H=1080, out=document.getElementById('out'), ctx=out.getContext('2d');
window.DURATION=27;
// ElevenLabs narration (voice: Arthur). The end card holds after t=18 while the last line finishes.
// vo-1 was recorded as "LaBro's agents pull..."; from:.46 skips the old name so it plays "Agents pull...". vo-4 said the old name and is dropped.
window.VOICEOVER=[]; // silent cut: Bryan talks over the film on stage.
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setSize(W,H); renderer.setPixelRatio(1); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(36,W/H,.1,300);
scene.add(new THREE.HemisphereLight(0xe7efff,0x657080,2));
const key=new THREE.DirectionalLight(0xffffff,3.1); key.position.set(-8,18,10); key.castShadow=true; key.shadow.mapSize.set(2048,2048); Object.assign(key.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:.1,far:70}); key.shadow.bias=-.0003; scene.add(key);
const mat=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness});
const white=mat(0xeceeea), light=mat(0xd4d9d9), dark=mat(0x414d57), yellow=mat(0xe8c24a), floorMat=mat(0x8e99a8), wall=mat(0xdce1e2), glass=mat(0x9bb2c0), black=mat(0x252e37);
function box(parent,x,y,z,w,h,d,m,r=.08){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),m); mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh);return mesh}
function cyl(parent,x,y,z,r,h,m){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
function textTexture(text,background='#ffffff',color='#26313b',size=70){const c=document.createElement('canvas');c.width=1024;c.height=256;const g=c.getContext('2d');g.fillStyle=background;g.fillRect(0,0,c.width,c.height);g.fillStyle=color;g.font=`600 ${size}px RobotoMono, monospace`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,512,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function sign(parent,text,x,y,z,w,h,bg='#ffffff',fg='#26313b'){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:textTexture(text,bg,fg),side:THREE.DoubleSide}));mesh.position.set(x,y,z);parent.add(mesh);return mesh}
const room=new THREE.Group();scene.add(room);
box(room,0,-.15,0,15,.3,11,floorMat,.03);box(room,0,2.4,-5.4,15,4.8,.2,wall);box(room,-7.4,2.4,0,.2,4.8,11,wall);
box(room,0,3.5,-5.27,10,.9,.04,glass,.01); for(let x=-5;x<=5;x+=2)box(room,x,3.5,-5.22,.07,.95,.05,white,.01);
function bench(x,z){box(room,x,1.1,z,3.5,.22,1.55,white);for(const dx of [-1.45,1.45])for(const dz of [-.6,.6])box(room,x+dx,.52,z+dz,.16,1,.16,light)}
bench(-4.8,-3.2);bench(.1,-3.2);bench(4.6,-3.2);
// Cytometer, microscope, and centrifuge.
box(room,-4.8,1.95,-3.2,1.55,1.55,1.15,white,.3);box(room,-4.8,2.05,-2.6,.65,.4,.05,dark,.03);box(room,-4.8,2.05,-2.56,.48,.23,.03,glass,.01);
box(room,0,1.34,-3.2,1.5,.22,1.1,light);box(room,-.55,2,-3.45,.25,1.4,.3,white);let arm=box(room,-.15,2.55,-3.45,1.05,.22,.25,white);arm.rotation.z=-.35;box(room,.2,1.85,-3.1,.9,.12,.7,dark);cyl(room,.25,2.18,-3.1,.12,.55,dark);
cyl(room,4.6,1.55,-3.2,.65,.75,white);cyl(room,4.6,1.98,-3.2,.68,.12,light);
// Desk and monitor.
box(room,3.5,1.15,2.8,3.7,.22,1.8,white);for(const dx of [-1.55,1.55])for(const dz of [-.65,.65])box(room,3.5+dx,.55,2.8+dz,.16,1.1,.16,light);
box(room,3.5,1.56,2.45,.22,.7,.22,light);box(room,3.5,2.12,2.45,2.1,1.25,.12,dark,.08);box(room,3.5,1.3,3.15,1.4,.07,.45,light,.02);
const images={};const imageNames=['02-schedule','03-drawer','04-week','05-results'];
const markLoad=new Promise(r=>{const im=new Image(256,256);im.onload=()=>{images.mark=im;r()};im.onerror=()=>r();im.src='./parity-mark-ink.svg'});
const loaded=[markLoad,...imageNames.map(n=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[n]=im;resolve()};im.onerror=reject;im.src=`./stills/${n}.png`}))];
let screen;
// Yellow safety rail around the instrument bay.
for(const x of [-6.6,1.8])for(const z of [-4.5,-1.35])cyl(room,x,.65,z,.055,1.3,yellow);
// Back rail is continuous; the front rail has a gate opening so the researcher walks in through it.
box(room,-2.4,1.27,-4.5,8.4,.09,.09,yellow,.03);
for(const x of [-5.3,-3.1])cyl(room,x,.65,-1.35,.055,1.3,yellow);
box(room,-5.95,1.27,-1.35,1.3,.09,.09,yellow,.03);box(room,-.65,1.27,-1.35,4.9,.09,.09,yellow,.03);
// Human faces the instruments. Limbs swing deterministically.
const human=new THREE.Group();room.add(human);box(human,0,1.22,0,.65,1.05,.43,white,.2);cyl(human,0,1.95,0,.25,.12,light);const head=new THREE.Mesh(new THREE.SphereGeometry(.27,20,14),mat(0xd8c8b6));head.position.y=2.2;head.castShadow=true;human.add(head);
const legs=[],arms=[];for(const s of [-1,1]){let leg=box(human,s*.19,.45,0,.19,.9,.22,dark,.08);legs.push(leg);let a=box(human,s*.43,1.25,0,.18,.85,.2,white,.08);arms.push(a)}
const packets=[];for(let i=0;i<18;i++){const p=box(room,0,0,0,.18,.18,.18,yellow,.05);packets.push(p)}
const panels=['FBS','iLab','Price sheet'].map((v,i)=>sign(room,v,-3+i*2.7,3,-.3,2.1,.55));
const agentNames=['Finder','Collector','Matcher','Pricer','Reviewer'];const agents=agentNames.map((v,i)=>{const g=new THREE.Group();room.add(g);box(g,0,0,0,1.35,.65,.12,white);sign(g,v,0,0,.075,1.25,.5,'#ffffff','#26313b');g.position.set(-.2+i*1.45,3,1.8);return g});
// Campus LOD is separate from the hero room.
const campus=new THREE.Group();scene.add(campus);box(campus,0,-.3,0,43,.25,37,floorMat);
for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){const g=new THREE.Group();g.position.set(ix*13,0,iz*11);campus.add(g);box(g,0,0,0,10,.2,8,wall);box(g,0,1,-3.9,10,2,.15,white);box(g,-4.9,1,0,.15,2,8,white);for(let j=-1;j<=1;j++){box(g,j*3,.65,-2.3,2.2,.2,1,light);box(g,j*3,1.15,-2.3,1,.8,.7,white)}if(ix||iz){const len=Math.hypot(ix*13,iz*11);const line=box(campus,ix*6.5,.03,iz*5.5,.08,.04,len,yellow,.01);line.rotation.y=Math.atan2(ix*13,iz*11)}}
const hub=new THREE.Group();campus.add(hub);box(hub,0,1,0,3,2,2,yellow,.15);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const ease=v=>{v=clamp(v);return v*v*(3-2*v)};const mix=(a,b,v)=>a+(b-a)*v;
function cameraAt(pos,target){camera.position.set(...pos);camera.lookAt(...target);camera.updateMatrixWorld()}
function sceneFrame(t){
 const campusMode=t>=14;room.visible=!campusMode;campus.visible=campusMode;
 // Walk to the gate opening, then step through it to the cytometer. Never crosses a rail.
 {const a=ease(t/2),b=ease((t-2)/1);const x=t<2?mix(1,-4.2,a):-4.2,z=t<2?mix(1.2,-.4,a):mix(-.4,-2.15,b);human.position.set(x,0,z);human.rotation.y=t<2?Math.atan2(-5.2,-1.6):Math.PI}
 const walk=t<3?Math.sin(t*9)*.35:0;legs[0].rotation.x=walk;legs[1].rotation.x=-walk;arms[0].rotation.x=-walk;arms[1].rotation.x=walk+(t>=2.7&&t<3.5?-.7:0);
 panels.forEach((p,i)=>{p.visible=false;p.position.y=2.2+ease((t-7.1-i*.2)/.7)*1.5});
 agents.forEach((a,i)=>{a.visible=false;a.children[0].material=(t>=10+i*.6)?yellow:white});
 packets.forEach((p,i)=>{p.visible=t>=5.5&&t<14;let q=((t-5.5)*.25+i/18)%1;let start=i%3;let sx=[-4.8,0,4.6][start],sz=-3.2;if(t>=8&&i%2){sx=-3+start*2.7;sz=-.3}if(t>=10){sx=-.2+(i%5)*1.45;sz=1.8;q=((t-10)*.45+i/18)%1;p.position.set(sx+q*1.3,3.05+Math.sin(q*Math.PI)*.25,1.8)}else p.position.set(mix(sx,3.5,q),mix(2.6,2.3,q)+Math.sin(q*Math.PI)*1.6,mix(sz,2.45,q))});
 if(t<3.5)cameraAt([12-mix(0,1,ease(t/3.5)),9,14],[0,1.2,-.5]);
 else if(t<5.5){let q=ease((t-3.5)/2);cameraAt([mix(11,3.5,q),mix(8,2.12,q),mix(14,4.15,q)],[mix(0,3.5,q),mix(1.2,2.12,q),mix(-.5,2.45,q)])}
 else if(t<14)cameraAt([11,13,15],[0,1,-.5]);
 else {hub.position.y=ease((t-14)/1.2)*1.5;const hy=hub.position.y+1;let q=ease((t-14)/1.6);let pos=[mix(12,31,q),mix(14,38,q),mix(16,40,q)],look=[0,0,0];
  if(t>=15.5){const d=ease((t-15.5)/1.0);pos=[mix(pos[0],0,d),mix(pos[1],hy,d),mix(pos[2],1.12,d)];look=[0,mix(0,hy,d),0]}cameraAt(pos,look)}
 panels.forEach(p=>p.lookAt(camera.position)); agents.forEach(a=>a.lookAt(camera.position));
 renderer.render(scene,camera);
}
function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke()}}
function appFrame(img,x,y,w,h,zoom=1,alpha=1){ctx.save();ctx.globalAlpha=alpha;roundRect(x,y,w,h,6,'#fff','#e7e5de');ctx.beginPath();ctx.roundRect(x+3,y+3,w-6,h-6,4);ctx.clip();ctx.drawImage(img,x+3,y+3,w-6,h-6);ctx.restore()}

// Fit the real interface to the filmed monitor before the screen fills the frame.
// Shot B is sampled only through its first second; later AI frames deform text and
// put a monitor stand in front of the interface. The final approach is composited.
const monitorTrack=[
 {at:0,quad:[[981,545],[1164,588],[1160,698],[980,645]]},
 {at:.5,quad:[[944,529],[1171,574],[1164,717],[943,660]]},
 {at:1,quad:[[858,487],[1201,533],[1193,746],[856,682]]}
];
function trackedMonitor(time){const i=time<=.5?0:1,a=monitorTrack[i],b=monitorTrack[i+1],q=clamp((time-a.at)/(b.at-a.at));return a.quad.map((p,j)=>p.map((v,k)=>mix(v,b.quad[j][k],q)))}
function imageTriangle(img,src,dst){
 const [a,b,c]=src,[p,q,r]=dst,det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
 const A=((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/det;
 const B=((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/det;
 const C=((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/det;
 const D=((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/det;
 ctx.save();ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.lineTo(...r);ctx.closePath();ctx.clip();ctx.setTransform(A,B,C,D,p[0]-A*a[0]-C*a[1],p[1]-B*a[0]-D*a[1]);ctx.drawImage(img,0,0);ctx.restore();
}
function imageQuad(img,quad){
 const point=(u,v)=>[0,1].map(k=>(1-v)*mix(quad[0][k],quad[1][k],u)+v*mix(quad[3][k],quad[2][k],u));
 const n=8;for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=x/n,v=y/n,U=(x+1)/n,V=(y+1)/n,p=[point(u,v),point(U,v),point(U,V),point(u,V)],a=[[u*img.width,v*img.height],[U*img.width,v*img.height],[U*img.width,V*img.height],[u*img.width,V*img.height]];
  imageTriangle(img,[a[0],a[1],a[2]],[p[0],p[1],p[2]]);imageTriangle(img,[a[0],a[2],a[3]],[p[0],p[2],p[3]]);
 }
}
function monitorHandoff(t,clip){
 const sourceTime=clamp((t-3.5)/.85),zoom=ease((t-4.35)/.8),settle=ease((t-5.15)/.35),quad=trackedMonitor(sourceTime),full=[[0,0],[W,0],[W,H],[0,H]];
 const scale=mix(1,9,zoom),cx=mix(1027,960,zoom),cy=mix(612,540,zoom);
 // Keep the sharp screen glued to the bezel until the bezel is outside the frame.
 // Only then remove perspective and reveal the complete interface.
 const projected=quad.map(p=>[cx+(p[0]-1027)*scale,cy+(p[1]-612)*scale]);
 const mapped=projected.map((p,i)=>p.map((v,k)=>mix(v,full[i][k],settle)));
 ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);ctx.translate(-1027,-612);ctx.drawImage(clip.v,0,0,W,H);ctx.restore();
 ctx.save();ctx.globalAlpha=ease((t-3.5)/.2);if(settle>.999)ctx.drawImage(images['02-schedule'],0,0,W,H);else imageQuad(images['02-schedule'],mapped);ctx.restore();
}

function caption(text){ctx.save();ctx.font='600 54px RobotoMono, monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle='#111';ctx.fillStyle='#fff';ctx.strokeText(text,W/2,1008);ctx.fillText(text,W/2,1008);ctx.restore()}
function project(x,y,z){let p=new THREE.Vector3(x,y,z).project(camera);return [(p.x+1)*W/2,(1-p.y)*H/2]}
function overlayBooking(t){let [x,y]=project(-4.8,3.5,-3.2);roundRect(x-175,y-42,350,64,12,'#e8c24a');ctx.fillStyle='#222a32';ctx.font='600 25px RobotoMono, monospace';ctx.textAlign='center';ctx.fillText('John · booked 9–11',x,y);let cx=x+225,cy=y-8;ctx.beginPath();ctx.arc(cx,cy,55,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#29333d';ctx.stroke();let hour=9+3.5*ease(t/3.5);for(const [angle,len,width] of [[hour/12*Math.PI*2,28,5],[(hour%1)*Math.PI*2,40,3]]){ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(angle)*len,cy-Math.cos(angle)*len);ctx.lineWidth=width;ctx.stroke()}roundRect(x-160,y+40,320,12,6,'#d9d9d9');roundRect(x-160,y+40,Math.max(1,320*ease(t/3.5)),12,6,'#c65c52')}
function rightProj(x,y,z){let [px,py]=project(x,y,z);return [480+px*.75,py*.75]}
function chip(x,y,w,h,label,on,sub,fs){ctx.save();ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=18;ctx.shadowOffsetY=6;roundRect(x,y,w,h,10,on?'#f4c430':'#f6f5f0');ctx.restore();ctx.fillStyle='#22221f';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+(fs||30)+'px RobotoMono, monospace';ctx.fillText(label,x+w/2,y+h/2+(sub?-12:0));if(sub){ctx.font='400 20px RobotoMono, monospace';ctx.fillText(sub,x+w/2,y+h/2+20)}}
function wire(x1,y1,x2,y2,a){ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='#e8c24a';ctx.lineWidth=3;ctx.setLineDash([10,10]);ctx.beginPath();ctx.moveTo(x1,y1);ctx.bezierCurveTo(x1,y1+120,x2,y2-120,x2,y2);ctx.stroke();ctx.restore()}
function overlaySources(t){const [dx,dy]=rightProj(3.5,2.4,2.45);[['Scheduler','FBS · iLab · PPMS'],['Plug sensors','power on / off'],['Instrument PCs','login sessions']].forEach(([n,sub],i)=>{const a=ease((t-7.1-i*.25)/.5);if(a<=0)return;const x=1000+i*300,y=130-30*(1-a);ctx.globalAlpha=a;wire(x+130,y+110,dx,dy,a);chip(x,y,270,110,n,false,sub,27);ctx.globalAlpha=1})}
function overlayAgents(t){const [dx,dy]=rightProj(3.5,2.4,2.45);agentNames.forEach((n,i)=>{const a=ease((t-10-i*.12)/.4);if(a<=0)return;const x=990+i*182,y=120;ctx.globalAlpha=a;const on=t>=10.6+i*.6;wire(x+82,y+90,dx,dy,on?1:.35);chip(x,y,164,90,n,on,null,25);if(i===4&&t>12.9){ctx.fillStyle='#22221f';ctx.font='700 40px RobotoMono, monospace';ctx.fillText('✓',x+146,y+14)}ctx.globalAlpha=1})}
function overlayHub(t){const [x,y]=project(0,hub.position.y+2.3,0);const a=ease((t-14.6)/.5);if(a<=0)return;ctx.globalAlpha=a;chip(x-110,y-90,220,76,'Parity',true);ctx.globalAlpha=1}
const clips={};
for(const [k,src,from,to] of [['a','clips/shot-a.mp4',0,3.5],['b','clips/shot-b.mp4',3.5,5.5]]){const v=document.createElement('video');v.src=src;v.muted=true;v.preload='auto';v.playsInline=true;clips[k]={id:k,v,from,to,ok:false};v.addEventListener('loadeddata',()=>{clips[k].ok=true});}
function clipFor(t){for(const c of Object.values(clips))if(c.ok&&t>=c.from&&t<c.to)return c;return null}
window.prepare=t=>{const c=clipFor(t);if(!c)return Promise.resolve();const target=Math.min(c.v.duration-0.04,c.id==='b'?clamp((t-3.5)/.85):(t-c.from)/(c.to-c.from)*c.v.duration);if(Math.abs(c.v.currentTime-target)<0.001)return Promise.resolve();return new Promise(r=>{c.v.addEventListener('seeked',()=>r(),{once:true});c.v.currentTime=target})};
function legacyRender(t){sceneFrame(t);let grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#1b2130');grad.addColorStop(1,'#2a3242');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 if(t>=5.5&&t<5.85){ctx.drawImage(images['02-schedule'],0,0,W,H)}
 else if(t>=5.85&&t<6.75){const q=ease((t-5.85)/.9);ctx.save();ctx.globalAlpha=q;ctx.beginPath();ctx.rect(960,0,960,1080);ctx.clip();ctx.drawImage(renderer.domElement,480+(1-q)*300,0,1440,1080);ctx.restore();
   const r=[mix(0,45,q),mix(0,250,q),mix(1920,850,q),mix(1080,478.125,q)];appFrame(images['02-schedule'],r[0],r[1],r[2],r[3],1)}
 else if(t<5.5&&clipFor(t)){const c=clipFor(t);if(c.id==='b')monitorHandoff(t,c);else ctx.drawImage(c.v,0,0,W,H)}
 else if(t<5.5||t>=14)ctx.drawImage(renderer.domElement,0,0);else{ctx.save();ctx.beginPath();ctx.rect(960,0,960,1080);ctx.clip();ctx.drawImage(renderer.domElement,480,0,1440,1080);ctx.restore();const zoom=1;if(t<10){appFrame(images['02-schedule'],45,250,850,478.125,zoom);if(t>=7.8)appFrame(images['03-drawer'],45,250,850,478.125,zoom,ease((t-7.8)/.4))}else appFrame(images['05-results'],45,250,850,478.125,1)}
 if(window.NO_OVERLAY)return;
 if(t<3.5)overlayBooking(t);
 if(t>=7.1&&t<10)overlaySources(t);
 if(t>=16.35){const Y='#F4C430',INK='#22221F';const f=ease((t-16.35)/.3);ctx.fillStyle=Y;ctx.globalAlpha=f;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
  if(t>=16.6){const m=ease((t-16.6)/.6),sz=mix(120,220,m);ctx.globalAlpha=m;if(images.mark)ctx.drawImage(images.mark,W/2-sz/2,mix(470,330,m)-sz/2,sz,sz);ctx.globalAlpha=1;
   const w=ease((t-16.9)/.55);ctx.save();ctx.beginPath();ctx.rect(0,450,W,190);ctx.clip();ctx.fillStyle=INK;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 132px RobotoMono, monospace';ctx.fillText('Parity',W/2,mix(700,540,w));ctx.restore();
   const g=ease((t-17.25)/.5);ctx.globalAlpha=g;ctx.fillStyle=INK;ctx.font='500 40px RobotoMono, monospace';ctx.textAlign='center';ctx.fillText('You run the science. Parity runs the lab.',W/2,mix(700,680,g));ctx.globalAlpha=1}}
};

// Agent pipeline, 10s to 22s of the film: five steps, one at a time, each paired with the app screen it produces.
const AG0=10,STEP=2.4,AG1=AG0+.6+STEP*5; // 22.6
const steps=[
 {n:'Find',sub:'the scheduler',img:'02-schedule',r:[480,120,3200,1300]},
 {n:'Collect',sub:'bookings + use',img:'04-week',r:[480,700,3200,1420]},
 {n:'Match',sub:'booked vs used',img:'03-drawer',r:[2440,1440,3160,1760]},
 {n:'Price',sub:'core rules',img:'05-results',r:[1410,500,1790,1720]},
 {n:'Flag',sub:'for approval',img:'05-results',r:[1790,500,2620,1720]}
];
function fitRegion(r,img){const IW=img.width,IH=img.height,A=IW/IH;let[x0,y0,x1,y1]=r;let w=x1-x0,h=y1-y0,cx=(x0+x1)/2,cy=(y0+y1)/2;w*=1.25;h*=1.25;if(w/h<A)w=h*A;else h=w/A;w=Math.min(w,IW);h=Math.min(h,IH);return[clamp(cx-w/2,0,IW-w),clamp(cy-h/2,0,IH-h),w,h]}
function appCrop(img,r,z,hl,alpha,X,Y,FW,FH){const IW=img.width,IH=img.height,[rx,ry,rw,rh]=fitRegion(r,img);const sx=mix(0,rx,z),sy=mix(0,ry,z),sw=mix(IW,rw,z),sh=mix(IH,rh,z);
 ctx.save();ctx.globalAlpha=alpha;roundRect(X,Y,FW,FH,6,'#fff','#e7e5de');ctx.beginPath();ctx.roundRect(X+3,Y+3,FW-6,FH-6,4);ctx.clip();ctx.drawImage(img,sx,sy,sw,sh,X+3,Y+3,FW-6,FH-6);
 if(hl>0){const k=(FW-6)/sw,hx=X+3+(r[0]-sx)*k,hy=Y+3+(r[1]-sy)*k,hw=(r[2]-r[0])*k,hh=(r[3]-r[1])*k;ctx.globalAlpha=alpha*hl;ctx.strokeStyle='#f4c430';ctx.lineWidth=7;ctx.beginPath();ctx.roundRect(hx,hy,hw,hh,8);ctx.stroke()}
 ctx.restore()}
function pipeline(T){const n=steps.length,cw=318,gap=46,x0=(W-(n*cw+(n-1)*gap))/2,y=56,h=128,cur=Math.floor((T-AG0-.6)/STEP);
 steps.forEach((s,i)=>{const app=ease((T-AG0-i*.1)/.4);if(app<=0)return;const x=x0+i*(cw+gap),st=T-AG0-.6-i*STEP,active=st>=0&&st<STEP,done=st>=STEP,pulse=active?ease(st/.35):0;
  // connector arrow to the next step, filled as work passes along it
  if(i<n-1){const ax=x+cw+6,bx=x+cw+gap-6,ay=y+h/2;ctx.save();ctx.globalAlpha=app;ctx.strokeStyle='rgba(246,245,240,.35)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx-8,ay);ctx.stroke();
   const f=clamp((st-STEP+.45)/.45);if(f>0){ctx.strokeStyle='#f4c430';ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(mix(ax,bx-8,f),ay);ctx.stroke()}
   ctx.fillStyle=f>=1?'#f4c430':'rgba(246,245,240,.35)';ctx.beginPath();ctx.moveTo(bx,ay);ctx.lineTo(bx-14,ay-10);ctx.lineTo(bx-14,ay+10);ctx.fill();ctx.restore()}
  ctx.save();ctx.globalAlpha=app*(active||done?1:.55);const sc=1+.07*pulse*(active?1:0);ctx.translate(x+cw/2,y+h/2);ctx.scale(sc,sc);ctx.translate(-(x+cw/2),-(y+h/2));
  ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=active?26:12;ctx.shadowOffsetY=6;roundRect(x,y,cw,h,12,active?'#f4c430':'#f6f5f0',active?'#22221f':null);ctx.shadowColor='transparent';
  // number badge, becomes a check when the step is done
  const bx=x+52,by=y+h/2;ctx.beginPath();ctx.arc(bx,by,30,0,Math.PI*2);ctx.fillStyle=done?'#22221f':(active?'#22221f':'#d9d6cc');ctx.fill();ctx.fillStyle=done||active?'#f4c430':'#22221f';ctx.font='700 32px RobotoMono, monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(done?'✓':String(i+1),bx,by+1);
  ctx.fillStyle='#22221f';ctx.textAlign='left';ctx.font='700 38px RobotoMono, monospace';ctx.fillText(s.n,x+98,y+h/2-16);ctx.font='500 22px RobotoMono, monospace';ctx.fillStyle='#4b4a44';ctx.fillText(s.sub,x+99,y+h/2+24);ctx.restore()});
 return clamp(cur,0,n-1)}
function agentScene(T){const legacyT=AG0+(T-AG0)*(4/(AG1-AG0));sceneFrame(Math.min(legacyT,13.99));let grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#1b2130');grad.addColorStop(1,'#2a3242');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 ctx.save();ctx.beginPath();ctx.rect(960,0,960,1080);ctx.clip();ctx.drawImage(renderer.domElement,480,0,1440,1080);ctx.restore();
 const X=45,Y=250,FW=850,FH=478.125;const st=T-AG0-.6,i=clamp(Math.floor(st/STEP),0,4),local=st-i*STEP;
 if(st<0){appCrop(images['02-schedule'],steps[0].r,0,0,1,X,Y,FW,FH)}else{const s=steps[i],prev=steps[i-1];const fade=i>0&&prev.img!==s.img?ease(local/.35):1;
  if(fade<1){const pz=1-ease(local/.35);appCrop(images[prev.img],prev.r,.55*pz,0,1,X,Y,FW,FH)}
  const z=.55*ease((local-.15)/.8)*(i===4?1:1);appCrop(images[s.img],s.r,z,ease((local-.5)/.3),fade,X,Y,FW,FH);
  // a yellow wire from the active step down to the lab monitor
  const n=5,cw=318,gap=46,x0=(W-(n*cw+(n-1)*gap))/2,cx=x0+i*(cw+gap)+cw/2;const[dx,dy]=rightProj(3.5,2.4,2.45);wire(cx,56+128,dx,dy,ease(local/.3)*(1-ease((local-STEP+.25)/.25)))}
 pipeline(T)}
window.renderAt=function(T){T=clamp(Number(T)||0,0,window.DURATION);if(T<AG0)return legacyRender(T);if(T<AG1)return agentScene(T);const t=Math.min(T-(AG1-14),18);legacyRender(t);};
window.selfTest=()=>{[0,5,9,11,14,17,20,23,26].forEach(window.renderAt);return true};
window.ready=Promise.all([...loaded,document.fonts.ready,...Object.values(clips).map(c=>new Promise(r=>{if(c.v.readyState>=2)return r();c.v.addEventListener('loadeddata',r,{once:true});c.v.addEventListener('error',r,{once:true});setTimeout(r,4000)}))]).then(()=>{const tex=new THREE.Texture(images['02-schedule']);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;screen=new THREE.Mesh(new THREE.PlaneGeometry(1.94,1.1),new THREE.MeshBasicMaterial({map:tex}));screen.position.set(3.5,2.12,2.52);room.add(screen);window.renderAt(0)});
