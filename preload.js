// Preload script - works with both contextIsolation enabled and disabled
const { ipcRenderer } = require('electron');

// Expose APIs directly on window (works when contextIsolation: false)
window.electronAPI = {
    // IPC events from main
    onSaveDownloads: (callback) => ipcRenderer.on('saveDownloads', (_event) => callback()),

    // App control
    quitApp: () => ipcRenderer.send('quitApp'),

    // Dialog operations
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    showErrorBox: (title, message) => ipcRenderer.invoke('dialog:showErrorBox', title, message),

    // File system operations
    existsSync: (filePath) => ipcRenderer.invoke('fs:existsSync', filePath),
    mkdirSync: (dirPath, options) => ipcRenderer.invoke('fs:mkdirSync', dirPath, options),
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    appendFile: (filePath, data) => ipcRenderer.invoke('fs:appendFile', filePath, data),
    appendFileSync: (filePath, data) => ipcRenderer.invoke('fs:appendFileSync', filePath, data),
    unlink: (filePath) => ipcRenderer.invoke('fs:unlink', filePath),
    unlinkSync: (filePath) => ipcRenderer.invoke('fs:unlinkSync', filePath),
    statSync: (filePath) => ipcRenderer.invoke('fs:statSync', filePath),
    access: (filePath, mode) => ipcRenderer.invoke('fs:access', filePath, mode),

    // Shell operations
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

    // Settings operations
    settingsGet: (keyPath, defaultValue) => ipcRenderer.invoke('settings:get', keyPath, defaultValue),
    settingsSet: (keyPath, value) => ipcRenderer.invoke('settings:set', keyPath, value),

    // Auth
    openLoginWindow: (subdomain) => ipcRenderer.invoke('auth:openLoginWindow', subdomain),

    // Download subtitle (https + vtt2srt pipeline)
    downloadSubtitle: (url, vttPath, srtPath) => ipcRenderer.invoke('download:subtitle', url, vttPath, srtPath),

    // App info
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getAppPath: (name) => ipcRenderer.invoke('app:getPath', name),
    getDirname: () => ipcRenderer.invoke('app:getDirname'),

    // Environment (static, available immediately)
    env: {
        DEBUG_MODE: process.env.DEBUG_MODE || false,
        SENTRY_DSN: process.env.SENTRY_DSN || "",
        IS_PACKAGE: process.env.IS_PACKAGE || false
    }
};
