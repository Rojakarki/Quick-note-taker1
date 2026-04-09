const { app, BrowserWindow, ipcMain, dialog } = require('electron');

app.disableHardwareAcceleration();

const path = require('node:path');
const fs = require('node:fs');

function createWindow() {
const win = new BrowserWindow({
width: 900,
height: 600,
webPreferences: {
preload: path.join(__dirname, 'preload.js'),
contextIsolation: true,
nodeIntegration: false
}
});

win.loadFile('index.html');
}

app.whenReady().then(() => {
createWindow();

app.on('activate', () => {
if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
});

app.on('window-all-closed', () => {
if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('save-note', async (event, text) => {
const filePath = path.join(app.getPath('documents'), 'quicknote.txt');
try {
fs.writeFileSync(filePath, text, 'utf-8');
return { success: true };
} catch (error) {
return { success: false, error: error.message };
}
});

ipcMain.handle('load-note', async () => {
const filePath = path.join(app.getPath('documents'), 'quicknote.txt');
try {
if (fs.existsSync(filePath)) {
return fs.readFileSync(filePath, 'utf-8');
}
return null;
} catch (error) {
return null;
}
});

ipcMain.handle('save-as', async (event, text) => {
const result = await dialog.showSaveDialog({
defaultPath: 'my-note.txt',
filters: [{ name: 'Text Files', extensions: ['txt'] }]
});

if (result.canceled) {
return { success: false };
}

try {
fs.writeFileSync(result.filePath, text, 'utf-8');
return { success: true, filePath: result.filePath };
} catch (error) {
return { success: false, error: error.message };
}
});
