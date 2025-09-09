// main.js — grow/shrink LEFT and report exact delta (px) to the renderer
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let win;
let animating = false;
let lastDelta = 0; // how much we actually grew last time

function clampGrowLeftDelta(bounds, desired) {
    const disp = screen.getDisplayMatching(bounds);
    const leftLimit = disp.workArea.x;
    const maxDelta = Math.max(0, bounds.x - leftLimit);
    return Math.min(desired, maxDelta);
}

function animateGrowLeft(delta, duration = 260) {
    if (!win || animating || delta <= 0) return 0;
    const b0 = win.getBounds();
    const used = clampGrowLeftDelta(b0, delta);
    if (used <= 0) return 0;

    animating = true;
    const steps = Math.max(1, Math.round(duration / 16));
    let i = 0;

    const tick = () => {
        i++;
        const t = i / steps;
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const cur = Math.round(used * ease);
        win.setBounds({ x: b0.x - cur, y: b0.y, width: b0.width + cur, height: b0.height }, true);
        if (i < steps) setTimeout(tick, 16);
        else { animating = false; lastDelta = used; }
    };
    tick();
    return used; // return the delta we will animate to
}

function animateShrinkLeft(delta, duration = 260) {
    if (!win || animating) return 0;
    const used = Math.max(0, Math.min(delta || lastDelta, lastDelta));
    if (used <= 0) { lastDelta = 0; return 0; }

    const b0 = win.getBounds();
    animating = true;
    const steps = Math.max(1, Math.round(duration / 16));
    let i = 0;

    const tick = () => {
        i++;
        const t = i / steps;
        const ease = Math.pow(t, 3); // ease-in cubic
        const cur = Math.round(used * ease);
        win.setBounds({ x: b0.x + cur, y: b0.y, width: b0.width - cur, height: b0.height }, true);
        if (i < steps) setTimeout(tick, 16);
        else { animating = false; lastDelta = 0; }
    };
    tick();
    return used; // return the delta we will shrink by
}

function createWindow() {
    win = new BrowserWindow({
        width: 900,
        height: 650,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    win.setMinimumSize(400, 350);
    win.loadFile('index.html');

    ipcMain.handle('win:smoothGrowLeft', (_e, px, ms) =>
        animateGrowLeft(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
    ipcMain.handle('win:smoothShrinkLeft', (_e, px, ms) =>
        animateShrinkLeft(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
