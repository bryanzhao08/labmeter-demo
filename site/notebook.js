'use strict';
const tabs=[...document.querySelectorAll('[role="tab"]')],pages=[...document.querySelectorAll('[role="tabpanel"]')];
let current=0;
function turnPage(index,focus=false){
 current=Math.max(0,Math.min(pages.length-1,index));
 tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===current));tab.tabIndex=i===current?0:-1;pages[i].hidden=i!==current});
 document.getElementById('previous-page').disabled=current===0;
 document.getElementById('next-page').disabled=current===pages.length-1;
 document.getElementById('page-status').textContent=`Page ${current+1} of ${pages.length}`;
 if(focus)tabs[current].focus();
}
tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>turnPage(i));tab.addEventListener('keydown',e=>{let target;if(e.key==='ArrowRight')target=(i+1)%tabs.length;if(e.key==='ArrowLeft')target=(i+tabs.length-1)%tabs.length;if(e.key==='Home')target=0;if(e.key==='End')target=tabs.length-1;if(target!==undefined){e.preventDefault();turnPage(target,true)}})});
document.getElementById('previous-page').addEventListener('click',()=>turnPage(current-1));
document.getElementById('next-page').addEventListener('click',()=>turnPage(current+1));
document.getElementById('learn-more').addEventListener('click',()=>{document.getElementById('notebook').focus({preventScroll:true})});
const dialog=document.getElementById('waitlist-dialog');
document.querySelectorAll('[data-waitlist]').forEach(button=>button.addEventListener('click',()=>dialog.showModal()));
document.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
document.getElementById('waitlist-form').addEventListener('submit',e=>{
 e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
 const email=form.elements.email.value.trim(),lab=form.elements.lab.value.trim();
 const body=`I'd like to join the LaBro waitlist.\n\nEmail: ${email}\nLab or university: ${lab||'(not provided)'}\n\nWhat I'd like help with:\n`;
 window.location.href='mailto:zhaobrya@usc.edu?subject='+encodeURIComponent('LaBro waitlist')+'&body='+encodeURIComponent(body);
 document.getElementById('waitlist-help').textContent='Finish sending in your email app. If it did not open, use the email link below. Your signup has not been sent by this page.';
});
// Old links from the download page still open the short explanation.
if(['#agent','#how','#connects','#tech','#pricing','#faq'].includes(location.hash)){document.getElementById('notebook').scrollIntoView();if(location.hash==='#pricing')turnPage(2);else if(location.hash!=='#agent')turnPage(1)}
if(location.hash==='#waitlist')dialog.showModal();
