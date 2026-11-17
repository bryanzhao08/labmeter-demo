const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('credential',{submit:token=>ipcRenderer.invoke('parity:credential:submit',String(token))});
