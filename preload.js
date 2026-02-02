const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    runPlaywrightTest: (script) => ipcRenderer.invoke('run-playwright-test', script),

    // Git Operations
    gitOps: {
        check: () => ipcRenderer.invoke('git-ops', 'check'),
        install: () => ipcRenderer.invoke('git-ops', 'install'),
        clone: (url, branch, auth) => ipcRenderer.invoke('git-ops', 'clone', { url, branch, auth })
    },

    // File Operations
    fileOps: {
        listFiles: (dirPath, extension) => ipcRenderer.invoke('file-ops', 'listFiles', { dirPath, extension }),
        readFile: (filePath) => ipcRenderer.invoke('file-ops', 'readFile', { filePath }),
        writeFile: (filePath, content) => ipcRenderer.invoke('file-ops', 'writeFile', { filePath, content })
    },

    // System Operations
    sysOps: {
        runCommand: (cwd, cmd) => ipcRenderer.invoke('sys-ops', 'runCommand', { cwd, cmd })
    }
});
