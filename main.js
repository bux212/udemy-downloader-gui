const { app, BrowserWindow, Menu, ipcMain, screen, shell, dialog, session } = require("electron");
const { join } = require("path");
const fs = require("fs");
const https = require("https");
const cookie = require("cookie");
const settings = require("electron-settings");

require("./environments.js");

const { version: appVersion, vars } = require("./package.json");

const isDebug = process.argv.indexOf("--developer") != -1;

if (isDebug) {
    console.log("Debug mode enabled");
    process.env.DEBUG_MODE = true;
    try {
        require('electron-reloader')(module, { ignore: ['udeler.log', 'node_modules'] });
    } catch {}
}

if (app.isPackaged) {
    process.env.IS_PACKAGE = true;
    const Sentry = require('@sentry/electron/main');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
} else {
    process.env.SENTRY_DSN = "";
}

let downloadsSaved = false;

function createWindow() {
    const size = screen.getPrimaryDisplay().workAreaSize;

    let win = new BrowserWindow({
        title: `Udeler | Udemy Course Downloader - v${appVersion}`,
        minWidth: 650,
        minHeight: 550,
        width: 650,
        height: size.height - 150,
        icon: join(__dirname, "app/assets/images/build/icon.png"),
        resizable: true,
        maximizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: join(__dirname, "preload.js")
        }
    });

    win.loadFile("app/index.html");

    if (isDebug) {
        win.openDevTools();
        win.maximize();
    }

    win.on("close", event => {
        saveOnClose(event);
    });

    win.on("closed", () => {
        win = null;
    });

    const template = [
        {
            label: app.name,
            submenu: [{ role: "quit" }]
        },
        {
            label: "View",
            submenu: [
                { role: "forcereload" },
                { type: "separator" },
                { role: "resetZoom" },
                { role: "zoomin" },
                { role: "zoomout" },
                { type: "separator" },
                { role: "togglefullscreen" }
            ]
        },
        {
            label: 'GitHub Repo',
            submenu: [
                {
                    label: 'This Version',
                    click: () => shell.openExternal('https://github.com/heliomarpm/udemy-downloader-gui/releases')
                },
                { type: "separator" },
                {
                    label: 'Original (Archived)',
                    click: () => shell.openExternal('https://github.com/FaisalUmair/udemy-downloader-gui/releases')
                }
            ]
        },
        {
            label: 'Donate',
            click: () => shell.openExternal(urlDonateWithMsg(vars.urlDonate))
        }
    ];

    if (!isDebug) {
        Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    }

    function saveOnClose(event = null) {
        if (!downloadsSaved) {
            downloadsSaved = true;
            if (event != null) { event.preventDefault(); }
            win.webContents.send("saveDownloads");
            console.log("saveOnClose", downloadsSaved);
        }
    }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Dialog operations
ipcMain.handle('dialog:openDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = dialog.showOpenDialogSync(win, { properties: ["openDirectory"] });
    return result;
});

ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return await dialog.showSaveDialog(win, options);
});

ipcMain.handle('dialog:showErrorBox', (_event, title, message) => {
    dialog.showErrorBox(title, message);
});

// File system operations
ipcMain.handle('fs:existsSync', (_event, filePath) => {
    return fs.existsSync(filePath);
});

ipcMain.handle('fs:mkdirSync', (_event, dirPath, options) => {
    fs.mkdirSync(dirPath, options || { recursive: true });
    return true;
});

ipcMain.handle('fs:writeFile', async (_event, filePath, data) => {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, data, (err) => {
            if (err) reject(err.message);
            else resolve(true);
        });
    });
});

ipcMain.handle('fs:appendFile', async (_event, filePath, data) => {
    return new Promise((resolve, reject) => {
        fs.appendFile(filePath, data, (err) => {
            if (err) reject(err.message);
            else resolve(true);
        });
    });
});

ipcMain.handle('fs:appendFileSync', (_event, filePath, data) => {
    fs.appendFileSync(filePath, Buffer.from(data));
    return true;
});

ipcMain.handle('fs:unlink', async (_event, filePath) => {
    return new Promise((resolve) => {
        fs.unlink(filePath, (err) => {
            if (err) resolve(false);
            else resolve(true);
        });
    });
});

ipcMain.handle('fs:unlinkSync', (_event, filePath) => {
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch { return false; }
});

ipcMain.handle('fs:statSync', (_event, filePath) => {
    try {
        const stat = fs.statSync(filePath);
        return { size: stat.size, isFile: stat.isFile(), isDirectory: stat.isDirectory() };
    } catch { return null; }
});

ipcMain.handle('fs:access', async (_event, filePath, mode) => {
    return new Promise((resolve) => {
        fs.access(filePath, mode, (err) => {
            resolve(!err);
        });
    });
});

// Download subtitle (https.get + vtt2srt pipeline)
ipcMain.handle('download:subtitle', async (_event, url, vttPath, srtPath) => {
    const vtt2srt = require("node-vtt-to-srt");
    return new Promise((resolve, reject) => {
        const vttFileWS = fs.createWriteStream(vttPath).on("finish", () => {
            const srtFileWS = fs.createWriteStream(srtPath).on("finish", () => {
                try { fs.unlinkSync(vttPath); } catch {}
                resolve(true);
            });
            fs.createReadStream(vttPath).pipe(vtt2srt()).pipe(srtFileWS);
        });

        https.get(url, (response) => {
            response.pipe(vttFileWS);
        }).on('error', (err) => {
            reject(err.message);
        });
    });
});

// Auth: open login window and intercept token
ipcMain.handle('auth:openLoginWindow', async (event, subdomain) => {
    return new Promise((resolve, reject) => {
        const parent = BrowserWindow.fromWebContents(event.sender);
        const dimensions = parent.getSize();

        const loginWin = new BrowserWindow({
            width: dimensions[0] - 100,
            height: dimensions[1] - 100,
            parent,
            modal: true,
        });

        session.defaultSession.webRequest.onBeforeSendHeaders(
            { urls: ["*://*.udemy.com/*"] },
            (request, callback) => {
                const token = request.requestHeaders.Authorization
                    ? request.requestHeaders.Authorization.split(" ")[1]
                    : cookie.parse(request.requestHeaders.Cookie || "").access_token;

                if (token) {
                    const extractedSubdomain = new URL(request.url).hostname.split(".")[0];
                    loginWin.destroy();
                    session.defaultSession.clearStorageData();
                    // Reset handler
                    session.defaultSession.webRequest.onBeforeSendHeaders(
                        { urls: ["*://*.udemy.com/*"] },
                        (req, cb) => { cb({ requestHeaders: req.requestHeaders }); }
                    );
                    resolve({ token, subdomain: extractedSubdomain });
                }
                callback({ requestHeaders: request.requestHeaders });
            }
        );

        loginWin.on('closed', () => {
            // Reset handler if window closed without token
            session.defaultSession.webRequest.onBeforeSendHeaders(
                { urls: ["*://*.udemy.com/*"] },
                (req, cb) => { cb({ requestHeaders: req.requestHeaders }); }
            );
            resolve(null);
        });

        const loginUrl = subdomain && subdomain !== "www"
            ? `https://${subdomain}.udemy.com`
            : "https://www.udemy.com/join/login-popup";
        loginWin.loadURL(loginUrl);
    });
});

// App info
ipcMain.handle('app:getVersion', () => appVersion);
ipcMain.handle('app:getPath', (_event, name) => app.getPath(name));
ipcMain.handle('app:getDirname', () => __dirname);

// Shell operations
ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(url));
ipcMain.handle('shell:openPath', (_event, path) => shell.openPath(path));

// Settings operations (proxy electron-settings through main process)
ipcMain.handle('settings:get', (_event, keyPath, defaultValue) => {
    return settings.get(keyPath, defaultValue);
});
ipcMain.handle('settings:set', (_event, keyPath, value) => {
    settings.set(keyPath, value);
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on("quitApp", () => {
    app.quit();
});

function urlDonateWithMsg(baseUrl) {
    return `${baseUrl}&item_name=${("Udeler is free and without any ads. If you appreciate that, please consider donating to the Developer.").replace(" ", "+")}`;
}
