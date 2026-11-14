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
