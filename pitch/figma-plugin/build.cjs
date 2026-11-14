'use strict';
// Refresh the embedded presenter notes from the current pitch script before import.
const fs=require('node:fs'),path=require('node:path');
const dir=__dirname,script=fs.readFileSync(path.join(dir,'../script-v6.md'),'utf8');
const chunks=script.split(/^## /m).slice(1,10);
if(chunks.length!==9)throw Error('Expected nine numbered script sections');
const notes=chunks.map(s=>s.replace(/^[^\n]*\n/, '').replace(/^\*\*On screen:\*\*[^\n]*\n?/m,'').replace(/\*\*/g,'').trim());
const source=fs.readFileSync(path.join(dir,'source.js'),'utf8');
const assets={};for(const name of ['usc-microscope.jpg','upload.png','schedule.png','results.png'])assets[name]=fs.readFileSync(path.join(dir,'../assets',name)).toString('base64');
fs.writeFileSync(path.join(dir,'code.js'),source.replace('/* NOTES_INSERT */',JSON.stringify(notes)).replace('/* ASSETS_INSERT */',JSON.stringify(assets)));
console.log('Built plugin with '+notes.length+' script notes');
