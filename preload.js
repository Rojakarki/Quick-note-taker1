const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveAs:           (text) =>            ipcRenderer.invoke('save-as', text),
    newNote:          ()    =>             ipcRenderer.invoke('new-note'),
    openFile:         ()    =>             ipcRenderer.invoke('open-file'),
    getNotes:         ()    =>             ipcRenderer.invoke('get-notes'),
    saveNoteJson:     (note) =>            ipcRenderer.invoke('save-note-json', note),
    deleteNote:       (id)  =>             ipcRenderer.invoke('delete-note', id),
    setUnsavedChanges:(unsaved) =>         ipcRenderer.invoke('set-unsaved-changes', unsaved),
    onMenuAction:     (channel, callback) => ipcRenderer.on(channel, callback),
});