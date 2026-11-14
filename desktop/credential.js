'use strict';
document.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();
  const input=document.getElementById('token');
  const token=input.value;input.value='';
  try{const error=await window.credential.submit(token);if(error)document.getElementById('error').textContent=error}
  catch(error){document.getElementById('error').textContent=error.message}
});
