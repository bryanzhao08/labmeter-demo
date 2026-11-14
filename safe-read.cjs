'use strict';
const fs=require('node:fs'),path=require('node:path');
// Component checks prevent ordinary symlink traversal. Portable Node APIs cannot
// eliminate a concurrent parent-directory replacement between the checks and open.
function readSafeFile(base,name,maxBytes){
  if(typeof name!=='string'||!name||path.isAbsolute(name))throw Error('Invalid file.');
  const root=path.resolve(base),target=path.resolve(root,name),rel=path.relative(root,target);
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Invalid file.');
  let current=root;
  if(fs.lstatSync(current).isSymbolicLink())throw Error('Invalid file.');
  for(const part of rel.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Invalid file.');}
  const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try {const st=fs.fstatSync(fd);if(!st.isFile()||st.size>maxBytes)throw Error('Invalid file.');
    const chunks=[];let total=0;const buf=Buffer.allocUnsafe(Math.min(65536,maxBytes+1));
    for(;;){const n=fs.readSync(fd,buf,0,Math.min(buf.length,maxBytes+1-total),null);if(!n)break;total+=n;if(total>maxBytes)throw Error('Invalid file.');chunks.push(Buffer.from(buf.subarray(0,n)));}
    return Buffer.concat(chunks,total);
  } finally {fs.closeSync(fd);}
}
module.exports={readSafeFile};
