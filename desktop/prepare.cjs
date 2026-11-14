const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), out = path.join(__dirname, 'web');
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(root)) {
  if (/\.(js|cjs|html|css)$/.test(name)) fs.copyFileSync(path.join(root,name),path.join(out,name));
}
for (const name of ['data','collector','vendor','media','fonts','mcp'])
  if (fs.existsSync(path.join(root,name))) fs.cpSync(path.join(root,name), path.join(out,name), {recursive:true});
// The MCP server reads its version from the package file one level up.
fs.copyFileSync(path.join(root,'package.json'), path.join(out,'package.json'));
for (const name of fs.readdirSync(out).filter(n=>n.endsWith('.html'))) {
  const p=path.join(out,name);
  fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/<link[^>]+https:\/\/fonts\.[^>]+>/g,''));
}
const p=path.join(out,'close.js');
fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','vendor/xlsx.full.min.js'));
