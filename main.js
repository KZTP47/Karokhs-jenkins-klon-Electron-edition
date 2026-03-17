const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

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

// ==========================================
// GIT OPERATIONS HANDLER
// ==========================================
ipcMain.handle('git-ops', async (event, command, args) => {
    console.log('[Main] Git Ops Request:', command, args);

    if (command === 'check') {
        return new Promise((resolve) => {
            exec('git --version', (err) => resolve(!err)); // Resolve true if no error
        });
    }

    if (command === 'install') {
        return new Promise((resolve, reject) => {
            // Use shell execution for winget to ensure it runs in a visible way if possible, or usually silent
            // Note: Winget might trigger UAC.
            console.log('[Main] Attempting to install Git via Winget...');
            const installCmd = 'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent';

            exec(installCmd, (err, stdout, stderr) => {
                if (err) {
                    console.error('[Main] Git Install Error:', err);
                    reject(new Error(`Installation failed: ${stderr || err.message}`));
                } else {
                    console.log('[Main] Git Installed:', stdout);
                    resolve(true);
                }
            });
        });
    }

    if (command === 'clone') {
        const { url, branch, auth } = args;
        if (!url) throw new Error('Repo URL is required');

        // created clean path
        const repoName = url.split('/').pop().replace('.git', '').replace(/[^a-zA-Z0-9-_]/g, '');
        const timestamp = Date.now();
        const targetPath = path.join(os.tmpdir(), 'lvx-repos', `${repoName}_${timestamp}`);

        // Ensure parent dir exists
        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

        return new Promise((resolve, reject) => {
            let cloneUrl = url;
            if (auth) {
                if (cloneUrl.startsWith('https://')) {
                    cloneUrl = cloneUrl.replace('https://', `https://${auth}@`);
                }
            }

            const branchFlag = branch ? `-b ${branch}` : '';
            console.log(`[Main] executing: git clone ${branchFlag} ${url} (Auth: ${!!auth})`);

            const cmd = `git clone ${branchFlag} "${cloneUrl}" "${targetPath}"`;

            exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    console.error('[Main] Clone Error:', stderr);
                    reject(new Error(stderr || err.message));
                } else {
                    console.log('[Main] Clone Success:', targetPath);
                    resolve({
                        success: true,
                        path: targetPath,
                        logs: stdout + '\n' + stderr
                    });
                }
            });
        });
    }
});

// ==========================================
// FILE OPERATIONS HANDLER
// ==========================================
ipcMain.handle('file-ops', async (event, command, args) => {
    if (command === 'listFiles') {
        const { dirPath, extension } = args;

        // Security check: ensure accessing allowed paths (like tmp)
        // For now, allowing all for prototype, but should restrict in production

        if (!fs.existsSync(dirPath)) throw new Error('Directory does not exist');

        const getAllFiles = (dir, ext, fileList = []) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    if (file !== '.git' && file !== 'node_modules') { // Ignore git and node_modules
                        getAllFiles(filePath, ext, fileList);
                    }
                } else {
                    if (!ext || file.endsWith('.' + ext)) {
                        fileList.push(filePath);
                    }
                }
            });
            return fileList;
        };

        return getAllFiles(dirPath, extension);
    }

    if (command === 'readFile') {
        const { filePath } = args;
        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
    }

    if (command === 'writeFile') {
        const { filePath, content } = args;
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    }

});

// SYSTEM OPERATIONS HANDLER (Shell Commands)
// ==========================================
ipcMain.handle('sys-ops', async (event, command, args) => {
    if (command === 'runCommand') {
        const { cwd, cmd } = args;

        if (!fs.existsSync(cwd)) {
            return { exitCode: 1, stdout: '', stderr: `Directory not found: ${cwd}` };
        }

        return new Promise((resolve) => {
            console.log(`Executing command: ${cmd} in ${cwd}`);
            exec(cmd, { cwd: cwd }, (error, stdout, stderr) => {
                resolve({
                    exitCode: error ? error.code || 1 : 0,
                    stdout: stdout || '',
                    stderr: stderr || (error ? error.message : '')
                });
            });
        });
    }
});

// ==========================================
// AI API HANDLER
// ==========================================
ipcMain.handle('ai-ops', async (event, command, args) => {
    if (command === 'generate') {
        const { provider, model, apiKey, prompt, systemPrompt, maxTokens: userMaxTokens } = args;
        const tokenLimit = userMaxTokens || 16384;

        // Determine the API endpoint and request format based on provider
        let url, headers, body;

        if (provider === 'openai') {
            url = 'https://api.openai.com/v1/chat/completions';
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
            body = JSON.stringify({
                model: model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: tokenLimit
            });
        } else if (provider === 'anthropic') {
            url = 'https://api.anthropic.com/v1/messages';
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            };
            body = JSON.stringify({
                model: model || 'claude-sonnet-4-20250514',
                max_tokens: tokenLimit,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: prompt }
                ]
            });
        } else if (provider === 'google') {
            url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`;
            headers = { 'Content-Type': 'application/json' };
            body = JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: tokenLimit }
            });
        } else if (provider === 'custom') {
            // Custom OpenAI-compatible endpoint
            url = args.customEndpoint;
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
            body = JSON.stringify({
                model: model || 'default',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: tokenLimit
            });
        } else {
            throw new Error(`Unknown AI provider: ${provider}`);
        }

        console.log(`[Main] AI API Request to ${provider} (${model})`);

        // Use Node.js built-in fetch (available in Electron's Node.js >= 18)
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // Extract the generated text based on provider response format
        let generatedText = '';
        if (provider === 'openai' || provider === 'custom') {
            generatedText = data.choices?.[0]?.message?.content || '';
        } else if (provider === 'anthropic') {
            generatedText = data.content?.[0]?.text || '';
        } else if (provider === 'google') {
            generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        return { success: true, generatedText: generatedText };
    }
});

// Clear corrupted GPU/disk cache on startup to prevent IndexedDB failures
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

app.whenReady().then(async () => {
    // Clear stale cache that causes "Access is denied" and IndexedDB errors
    try {
        const session = require('electron').session;
        await session.defaultSession.clearCache();
        await session.defaultSession.clearStorageData({ storages: ['cachestorage'] });
        console.log('[Main] Cache cleared successfully');
    } catch (e) {
        console.warn('[Main] Cache clear warning (non-fatal):', e.message);
    }

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
