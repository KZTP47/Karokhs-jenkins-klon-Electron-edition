const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// const __filename = fileURLToPath(import.meta.url); // Not needed in CommonJS
// const __dirname = path.dirname(__filename); // __dirname is global in CommonJS

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadFile('index.html');
    // win.webContents.openDevTools(); // Optional: Open DevTools
};

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Placeholders
const { runPlaywrightScript } = require('./services/playwright-runner');

ipcMain.handle('run-playwright-test', async (event, testScript) => {
    console.log('Received Playwright test request. Length:', testScript.length);
    try {
        const result = await runPlaywrightScript(testScript);
        return result;
    } catch (err) {
        return { status: 'ERROR', logs: `Internal Runner Error: ${err.message}` };
    }
});
