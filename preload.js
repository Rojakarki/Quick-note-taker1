const {contextBridge, ipcRenderer}=require('electron');
const { startTransition } = require('react');
contextBridge.exposeInMainWorld('electronAPI',{
    saveNote: (text) => ipcRenderer.invoke('save-note',text),
    loadNote: () => ipcRenderer.invoke('load-note'),
    saveAs: (text) => ipcRenderer.invoke('save-as', text),
    newNote: () => ipcRenderer.invoke('new-note'),
    openFile: () => ipcRenderer.invoke('open-file'),
    smartSave: (text, filePath) => ipcRenderer.invoke('smart-save', text, filePath),
    onMenuAction: (Channel, callback) => ipcRenderer.on(Channel,callback)    
});