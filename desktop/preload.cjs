// The only bridge between the page and the computer: one chosen folder, read-only.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('parityFS',{
  get:()=>ipcRenderer.invoke('parity:folder:get'),
  pick:()=>ipcRenderer.invoke('parity:folder:pick'),
  forget:()=>ipcRenderer.invoke('parity:folder:forget'),
  scan:()=>ipcRenderer.invoke('parity:folder:scan'),
  read:name=>ipcRenderer.invoke('parity:folder:read',String(name)),
  onChange:cb=>{ipcRenderer.on('parity:folder-changed',()=>cb())}
});
contextBridge.exposeInMainWorld('parityConn',{
  get:()=>ipcRenderer.invoke('parity:conn:get'),
  save:d=>ipcRenderer.invoke('parity:conn:save',{system:String(d.system),base:d.base?String(d.base):'',coreId:String(d.coreId||'')}),
  forget:()=>ipcRenderer.invoke('parity:conn:forget'),
  test:()=>ipcRenderer.invoke('parity:conn:test'),
  apps:()=>ipcRenderer.invoke('parity:detect:apps'),
  mcp:()=>ipcRenderer.invoke('parity:mcp:info'),
  saveRules:json=>ipcRenderer.invoke('parity:rules:save',String(json))
});

contextBridge.exposeInMainWorld('parityAgent',{
  info:()=>ipcRenderer.invoke('parity:agent:info'),
  start:input=>ipcRenderer.invoke('parity:agent:start',{system:String(input.system),month:String(input.month),scenario:String(input.scenario||'normal')}),
  get:id=>ipcRenderer.invoke('parity:agent:get',String(id)),
  cancel:id=>ipcRenderer.invoke('parity:agent:cancel',String(id)),
  openPractice:system=>ipcRenderer.invoke('parity:agent:practice',String(system))
});
