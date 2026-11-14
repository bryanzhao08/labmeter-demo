// The only bridge between the page and the computer: one chosen folder, read-only.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('labroFS',{
  get:()=>ipcRenderer.invoke('labro:folder:get'),
  pick:()=>ipcRenderer.invoke('labro:folder:pick'),
  forget:()=>ipcRenderer.invoke('labro:folder:forget'),
  scan:()=>ipcRenderer.invoke('labro:folder:scan'),
  read:name=>ipcRenderer.invoke('labro:folder:read',String(name)),
  onChange:cb=>{ipcRenderer.on('labro:folder-changed',()=>cb())}
});
contextBridge.exposeInMainWorld('labroConn',{
  get:()=>ipcRenderer.invoke('labro:conn:get'),
  save:d=>ipcRenderer.invoke('labro:conn:save',{system:String(d.system),base:d.base?String(d.base):'',coreId:String(d.coreId||'')}),
  forget:()=>ipcRenderer.invoke('labro:conn:forget'),
  test:()=>ipcRenderer.invoke('labro:conn:test'),
  apps:()=>ipcRenderer.invoke('labro:detect:apps'),
  mcp:()=>ipcRenderer.invoke('labro:mcp:info'),
  saveRules:json=>ipcRenderer.invoke('labro:rules:save',String(json))
});
