const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveNote: (text) => ipcRenderer.invoke('save-note', text),
    loadNote: () => ipcRenderer.invoke('load-note'),
    saveAs: (text) => ipcRenderer.invoke('save-as', text)
});
