const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('credential',{submit:token=>ipcRenderer.invoke('labro:credential:submit',String(token))});
