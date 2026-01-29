const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    runPlaywrightTest: (script) => ipcRenderer.invoke('run-playwright-test', script),
    // Add other file system capabilities here later
});
