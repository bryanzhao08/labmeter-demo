'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readSafeFile}=require('../safe-read.cjs');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'labro-safe-'));
try{
  fs.mkdirSync(path.join(base,'inside'));fs.writeFileSync(path.join(base,'inside','sample.csv'),'12345');
  assert.equal(readSafeFile(base,'inside/sample.csv',5).toString(),'12345');
  assert.throws(()=>readSafeFile(base,'inside/sample.csv',4));
  assert.throws(()=>readSafeFile(base,'../outside.csv',5));
  fs.symlinkSync(path.join(base,'inside'),path.join(base,'link'));
  fs.symlinkSync(path.join(base,'inside','sample.csv'),path.join(base,'file-link.csv'));
  assert.throws(()=>readSafeFile(base,'link/sample.csv',5));
  assert.throws(()=>readSafeFile(base,'file-link.csv',5));
  console.log('safe reader tests pass');
}finally{fs.rmSync(base,{recursive:true,force:true});}
