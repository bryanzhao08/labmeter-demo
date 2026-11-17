/* Client-specific settings; no secrets and no mutation of client configuration. */
(function(root){
'use strict';
function config(info,client='claude',practice=false){
 if(!info?.available)return '';
 const servers={parity:{command:info.command,args:info.args,env:info.env}};
 if(practice&&info.agentArgs)servers['parity-scheduling-practice']={command:info.command,args:info.agentArgs,env:info.env};
 if(client==='claude')return JSON.stringify({mcpServers:servers},null,2);
 if(client!=='codex')throw Error('Choose Claude or Codex.');
 return Object.entries(servers).map(([name,s])=>`[mcp_servers.${name}]\ncommand = ${JSON.stringify(s.command)}\nargs = ${JSON.stringify(s.args)}\n\n[mcp_servers.${name}.env]\n${Object.entries(s.env||{}).map(([k,v])=>`${k} = ${JSON.stringify(v)}`).join('\n')}`).join('\n\n');
}
const api={config};root.LBConnectorConfig=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
