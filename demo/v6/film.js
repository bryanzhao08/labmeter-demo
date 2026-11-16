import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/addons/RoundedBoxGeometry.js';

const W=1920,H=1080, out=document.getElementById('out'), ctx=out.getContext('2d');
window.DURATION=18;
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
const images={};const imageNames=['02-schedule','03-drawer','05-results'];
const loaded=imageNames.map(n=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[n]=im;resolve()};im.onerror=reject;im.src=`./stills/${n}.png`}));
let screen;
// Yellow safety rail around the instrument bay.
for(const x of [-6.6,1.8])for(const z of [-4.5,-1.35])cyl(room,x,.65,z,.055,1.3,yellow);
for(const z of [-4.5,-1.35])box(room,-2.4,1.27,z,8.4,.09,.09,yellow,.03);
// Human faces the instruments. Limbs swing deterministically.
const human=new THREE.Group();room.add(human);box(human,0,1.22,0,.65,1.05,.43,white,.2);cyl(human,0,1.95,0,.25,.12,light);const head=new THREE.Mesh(new THREE.SphereGeometry(.27,20,14),mat(0xd8c8b6));head.position.y=2.2;head.castShadow=true;human.add(head);
const legs=[],arms=[];for(const s of [-1,1]){let leg=box(human,s*.19,.45,0,.19,.9,.22,dark,.08);legs.push(leg);let a=box(human,s*.43,1.25,0,.18,.85,.2,white,.08);arms.push(a)}
const packets=[];for(let i=0;i<18;i++){const p=box(room,0,0,0,.18,.18,.18,yellow,.05);packets.push(p)}
const panels=['FBS','iLab','Price sheet'].map((v,i)=>sign(room,v,-3+i*2.7,3,-.3,2.1,.55));
const agentNames=['Finder','Collector','Matcher','Pricer','Reviewer'];const agents=agentNames.map((v,i)=>{const g=new THREE.Group();room.add(g);box(g,0,0,0,1.35,.65,.12,white);sign(g,v,0,0,.075,1.25,.5,'#ffffff','#26313b');g.position.set(-.2+i*1.45,3,1.8);return g});
// Campus LOD is separate from the hero room.
const campus=new THREE.Group();scene.add(campus);box(campus,0,-.3,0,43,.25,37,floorMat);
for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){const g=new THREE.Group();g.position.set(ix*13,0,iz*11);campus.add(g);box(g,0,0,0,10,.2,8,wall);box(g,0,1,-3.9,10,2,.15,white);box(g,-4.9,1,0,.15,2,8,white);for(let j=-1;j<=1;j++){box(g,j*3,.65,-2.3,2.2,.2,1,light);box(g,j*3,1.15,-2.3,1,.8,.7,white)}if(ix||iz){const len=Math.hypot(ix*13,iz*11);const line=box(campus,ix*6.5,.03,iz*5.5,.08,.04,len,yellow,.01);line.rotation.y=Math.atan2(ix*13,iz*11)}}
const hub=new THREE.Group();campus.add(hub);box(hub,0,1,0,3,2,2,yellow,.15);sign(hub,'LaBro',0,1,1.02,2.6,.75,'#e8c24a','#27313a');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const ease=v=>{v=clamp(v);return v*v*(3-2*v)};const mix=(a,b,v)=>a+(b-a)*v;
function cameraAt(pos,target){camera.position.set(...pos);camera.lookAt(...target);camera.updateMatrixWorld()}
function sceneFrame(t){
 const campusMode=t>=14;room.visible=!campusMode;campus.visible=campusMode;
 human.position.set(mix(1,-3.8,ease(t/3)),0,mix(1,-1.9,ease(t/3))); human.rotation.y=-2.2;
 const walk=t<3?Math.sin(t*9)*.35:0;legs[0].rotation.x=walk;legs[1].rotation.x=-walk;arms[0].rotation.x=-walk;arms[1].rotation.x=walk+(t>=2.7&&t<3.5?-.7:0);
 panels.forEach((p,i)=>{p.visible=false;p.position.y=2.2+ease((t-7.1-i*.2)/.7)*1.5});
 agents.forEach((a,i)=>{a.visible=false;a.children[0].material=(t>=10+i*.6)?yellow:white});
 packets.forEach((p,i)=>{p.visible=t>=5.5&&t<14;let q=((t-5.5)*.25+i/18)%1;let start=i%3;let sx=[-4.8,0,4.6][start],sz=-3.2;if(t>=8&&i%2){sx=-3+start*2.7;sz=-.3}if(t>=10){sx=-.2+(i%5)*1.45;sz=1.8;q=((t-10)*.45+i/18)%1;p.position.set(sx+q*1.3,3.05+Math.sin(q*Math.PI)*.25,1.8)}else p.position.set(mix(sx,3.5,q),mix(2.6,2.3,q)+Math.sin(q*Math.PI)*1.6,mix(sz,2.45,q))});
 if(t<3.5)cameraAt([12-mix(0,1,ease(t/3.5)),9,14],[0,1.2,-.5]);
 else if(t<5.5){let q=ease((t-3.5)/2);cameraAt([mix(11,3.5,q),mix(8,2.12,q),mix(14,4.15,q)],[mix(0,3.5,q),mix(1.2,2.12,q),mix(-.5,2.45,q)])}
 else if(t<14)cameraAt([11,13,15],[0,1,-.5]);
 else {let q=ease((t-14)/2);cameraAt([mix(12,31,q),mix(14,38,q),mix(16,40,q)],[0,0,0]);hub.position.y=ease((t-14)/1.5)*1.5}
 panels.forEach(p=>p.lookAt(camera.position)); agents.forEach(a=>a.lookAt(camera.position));
 renderer.render(scene,camera);
}
function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke()}}
function appFrame(img,x,y,w,h,zoom=1,alpha=1){ctx.save();ctx.globalAlpha=alpha;roundRect(x,y,w,h,6,'#fff','#e7e5de');ctx.beginPath();ctx.roundRect(x+3,y+3,w-6,h-6,4);ctx.clip();let iw=w*zoom,ih=iw*img.height/img.width;if(ih<h){ih=h*zoom;iw=ih*img.width/img.height}ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);ctx.restore()}
function caption(text){ctx.save();ctx.font='600 54px RobotoMono, monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle='#111';ctx.fillStyle='#fff';ctx.strokeText(text,W/2,1008);ctx.fillText(text,W/2,1008);ctx.restore()}
function project(x,y,z){let p=new THREE.Vector3(x,y,z).project(camera);return [(p.x+1)*W/2,(1-p.y)*H/2]}
function overlayBooking(t){let [x,y]=project(-4.8,3.5,-3.2);roundRect(x-175,y-42,350,64,12,'#e8c24a');ctx.fillStyle='#222a32';ctx.font='600 25px RobotoMono, monospace';ctx.textAlign='center';ctx.fillText('John · booked 9–11',x,y);let cx=x+225,cy=y-8;ctx.beginPath();ctx.arc(cx,cy,55,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#29333d';ctx.stroke();let hour=9+3.5*ease(t/3.5);for(const [angle,len,width] of [[hour/12*Math.PI*2,28,5],[(hour%1)*Math.PI*2,40,3]]){ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(angle)*len,cy-Math.cos(angle)*len);ctx.lineWidth=width;ctx.stroke()}roundRect(x-160,y+40,320,12,6,'#d9d9d9');roundRect(x-160,y+40,Math.max(1,320*ease(t/3.5)),12,6,'#c65c52')}
function rightProj(x,y,z){let [px,py]=project(x,y,z);return [480+px*.75,py*.75]}
function chip(x,y,w,h,label,on,sub,fs){ctx.save();ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=18;ctx.shadowOffsetY=6;roundRect(x,y,w,h,10,on?'#f4c430':'#f6f5f0');ctx.restore();ctx.fillStyle='#22221f';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+(fs||30)+'px RobotoMono, monospace';ctx.fillText(label,x+w/2,y+h/2+(sub?-12:0));if(sub){ctx.font='400 20px RobotoMono, monospace';ctx.fillText(sub,x+w/2,y+h/2+20)}}
function wire(x1,y1,x2,y2,a){ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='#e8c24a';ctx.lineWidth=3;ctx.setLineDash([10,10]);ctx.beginPath();ctx.moveTo(x1,y1);ctx.bezierCurveTo(x1,y1+120,x2,y2-120,x2,y2);ctx.stroke();ctx.restore()}
function overlaySources(t){const [dx,dy]=rightProj(3.5,2.4,2.45);[['FBS','reservations'],['iLab','equipment'],['Price sheet','rates']].forEach(([n,sub],i)=>{const a=ease((t-7.1-i*.25)/.5);if(a<=0)return;const x=1010+i*300,y=130-30*(1-a);ctx.globalAlpha=a;wire(x+130,y+110,dx,dy,a);chip(x,y,260,110,n,false,sub);ctx.globalAlpha=1})}
function overlayAgents(t){const [dx,dy]=rightProj(3.5,2.4,2.45);agentNames.forEach((n,i)=>{const a=ease((t-10-i*.12)/.4);if(a<=0)return;const x=990+i*182,y=120;ctx.globalAlpha=a;const on=t>=10.6+i*.6;wire(x+82,y+90,dx,dy,on?1:.35);chip(x,y,164,90,n,on,null,25);if(i===4&&t>12.9){ctx.fillStyle='#22221f';ctx.font='700 40px RobotoMono, monospace';ctx.fillText('✓',x+146,y+14)}ctx.globalAlpha=1})}
function overlayHub(t){const [x,y]=project(0,hub.position.y+2.3,0);const a=ease((t-14.6)/.5);if(a<=0)return;ctx.globalAlpha=a;chip(x-110,y-90,220,76,'LaBro',true);ctx.globalAlpha=1}
window.renderAt=function(t){t=clamp(Number(t)||0,0,18);sceneFrame(t);let grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#1b2130');grad.addColorStop(1,'#2a3242');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 if(t<5.5||t>=14)ctx.drawImage(renderer.domElement,0,0);else{ctx.save();ctx.beginPath();ctx.rect(960,0,960,1080);ctx.clip();ctx.drawImage(renderer.domElement,480,0,1440,1080);ctx.restore();const zoom=1+.06*ease((t-5.5)/4.5);if(t<10){appFrame(images['02-schedule'],45,160,850,650,zoom);if(t>=7.8)appFrame(images['03-drawer'],45,160,850,650,zoom,ease((t-7.8)/.4))}else appFrame(images['05-results'],45,160,850,650,1.02)}
 if(t<3.5){overlayBooking(t);caption('Booked 2 hours. Used 3.5.')}else if(t>=5.5&&t<10)caption("LaBro's agents pull every booking, log and price.");else if(t>=10&&t<14)caption('Match. Price. Flag. You approve.');
 if(t>=7.1&&t<10)overlaySources(t);if(t>=10&&t<14)overlayAgents(t);if(t>=14&&t<16.4){overlayHub(t);caption('One LaBro for every core on campus.')}
 if(t>=16){let a=ease((t-16)/.8);ctx.fillStyle=`rgba(27,33,48,${a})`;ctx.fillRect(0,0,W,H);ctx.globalAlpha=a;ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='600 120px RobotoMono, monospace';ctx.fillText('LaBro',960,500);ctx.fillStyle='#f4c430';ctx.font='600 40px RobotoMono, monospace';ctx.fillText('You run the science. LaBro runs the lab.',960,590);ctx.globalAlpha=1}
};
window.selfTest=()=>{[0,5,9,12,17].forEach(window.renderAt);return true};
window.ready=Promise.all([...loaded,document.fonts.ready]).then(()=>{const tex=new THREE.Texture(images['02-schedule']);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;screen=new THREE.Mesh(new THREE.PlaneGeometry(1.94,1.1),new THREE.MeshBasicMaterial({map:tex}));screen.position.set(3.5,2.12,2.52);room.add(screen);window.renderAt(0)});
