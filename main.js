// main.js — async grow/shrink + right-edge capacity aware + genie minimize/restore
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let win;
let animating = false;
let savedBounds = null;        // last normal bounds before genie-minimize
let wasGenieMinimized = false; // whether we ended in our custom minimized state

// ===== Utilities =====
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => Math.pow(t, 3);

function workAreaFor(w) {
    const b = w.getBounds();
    const disp = screen.getDisplayMatching(b);
    return disp.workArea; // excludes taskbar/dock
}

// How much room exists to grow to the RIGHT within the display work area?
function rightGrowCapacity(w) {
    const b = w.getBounds();
    const disp = screen.getDisplayMatching(b);
    const wa = disp.workArea; // excludes taskbar/dock
    const rightEdge = b.x + b.width;
    const waRight = wa.x + wa.width;
    return Math.max(0, waRight - rightEdge);
}

// ===== Window size animations (right-edge grow/shrink) =====
function animateGrowRight(delta, duration = 260) {
    if (!win || animating || delta <= 0) return Promise.resolve(0);
    if (win.isFullScreen && win.isFullScreen()) return Promise.resolve(0);

    const capacity = rightGrowCapacity(win);
    const used = Math.min(delta, capacity);
    if (used <= 0) return Promise.resolve(0);

    return new Promise((resolve) => {
        const b0 = win.getBounds();
        animating = true;
        const steps = Math.max(1, Math.round(duration / 16));
        let i = 0;

        const tick = () => {
            i++;
            const t = i / steps;
            const e = 1 - Math.pow(1 - t, 3); // ease-out
            const cur = Math.round(used * e);
            win.setBounds({ x: b0.x, y: b0.y, height: b0.height, width: b0.width + cur }, true);
            if (i < steps) setTimeout(tick, 16);
            else { animating = false; resolve(used); }
        };
        tick();
    });
}

function animateShrinkRight(delta, duration = 260) {
    if (!win || animating) return Promise.resolve(0);
    if (win.isFullScreen && win.isFullScreen()) return Promise.resolve(0);
    const used = Math.max(0, delta | 0);
    if (used <= 0) return Promise.resolve(0);

    return new Promise((resolve) => {
        const b0 = win.getBounds();
        animating = true;
        const steps = Math.max(1, Math.round(duration / 16));
        let i = 0;

        const tick = () => {
            i++;
            const t = i / steps;
            const e = Math.pow(t, 3); // ease-in
            const cur = Math.round(used * e);
            win.setBounds({ x: b0.x, y: b0.y, height: b0.height, width: b0.width - cur }, true);
            if (i < steps) setTimeout(tick, 16);
            else { animating = false; resolve(used); }
        };
        tick();
    });
}

// ===== Genie minimize/restore =====
async function animateGenieMinimize({ scale = 0.10, duration = 320 } = {}) {
    if (!win || animating) return;
    const startBounds = win.getBounds();
    savedBounds = { ...startBounds }; // keep exact return point

    const wa = workAreaFor(win);
    const waBottom = wa.y + wa.height;

    const targetW = Math.max(1, Math.round(startBounds.width * scale));
    const targetH = Math.max(1, Math.round(startBounds.height * scale));

    // Animate using bottom-left anchor toward work-area bottom-left
    const startBLx = startBounds.x;
    const startBLy = startBounds.y + startBounds.height;
    const endBLx = wa.x;
    const endBLy = waBottom;

    const steps = Math.max(1, Math.round(duration / 16));
    let i = 0; animating = true;

    win.setOpacity(1);

    await new Promise(resolve => {
        const tick = () => {
            i++;
            const t = i / steps;
            const e = easeOut(t);

            const w = Math.max(1, Math.round(lerp(startBounds.width, targetW, e)));
            const h = Math.max(1, Math.round(lerp(startBounds.height, targetH, e)));
            const blx = Math.round(lerp(startBLx, endBLx, e));
            const bly = Math.round(lerp(startBLy, endBLy, e));
            const x = blx;
            const y = bly - h; // convert bottom-left to top-left

            win.setBounds({ x, y, width: w, height: h }, true);
            win.setOpacity(1 - e);

            if (i < steps) setTimeout(tick, 16);
            else resolve();
        };
        tick();
    });

    wasGenieMinimized = true;
    animating = false;

    if (process.platform === 'darwin') {
        win.hide();     // Dock icon remains; app 'activate' will restore
    } else {
        win.minimize(); // keeps taskbar item; 'restore' will animate
    }
}

async function animateGenieRestore({ scale = 0.10, duration = 320 } = {}) {
    if (!win || !savedBounds || animating) return;

    const wa = workAreaFor(win);
    const waBottom = wa.y + wa.height;
    const targetBounds = { ...savedBounds };

    // Start tiny at bottom-left with 0 opacity
    const startW = Math.max(1, Math.round(targetBounds.width * scale));
    const startH = Math.max(1, Math.round(targetBounds.height * scale));
    const startX = wa.x;
    const startY = waBottom - startH;

    // Pose window at start; make visible but transparent
    win.setBounds({ x: startX, y: startY, width: startW, height: startH }, false);
    win.setOpacity(0);
    win.show();

    const steps = Math.max(1, Math.round(duration / 16));
    let i = 0; animating = true;

    await new Promise(resolve => {
        const tick = () => {
            i++;
            const t = i / steps;
            const e = easeIn(t); // nice reverse of easeOut

            const w = Math.max(1, Math.round(lerp(startW, targetBounds.width, e)));
            const h = Math.max(1, Math.round(lerp(startH, targetBounds.height, e)));
            const blx = Math.round(lerp(startX, targetBounds.x, e));
            const bly = Math.round(lerp(startY + startH, targetBounds.y + targetBounds.height, e));
            const x = blx;
            const y = bly - h;

            win.setBounds({ x, y, width: w, height: h }, true);
            win.setOpacity(e);

            if (i < steps) setTimeout(tick, 16);
            else resolve();
        };
        tick();
    });

    // Land exactly
    win.setBounds(targetBounds, false);
    win.setOpacity(1);
    wasGenieMinimized = false;
    animating = false;
}

const fs = require('fs');
const fsp = fs.promises;

// ===== Create window & IPC =====
function createWindow() {
    win = new BrowserWindow({
        width: 700,
        height: 450,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
        fullscreenable: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    win.setMinimumSize(400, 350);
    win.loadFile('index.html');

    // Grow/shrink IPC
    ipcMain.handle('win:smoothGrowRight', async (_e, px, ms) =>
        animateGrowRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
    ipcMain.handle('win:smoothShrinkRight', async (_e, px, ms) =>
        animateShrinkRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );

    // Window control IPC
    ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
    ipcMain.handle('win:close', () => { if (win) win.close(); });

    // Genie minimize trigger
    ipcMain.handle('win:animateMinimize', async () => {
        if (!win || animating) return;
        await animateGenieMinimize();
    });

    // Fullscreen helpers
    ipcMain.handle('win:isFullScreen', () => (win?.isFullScreen?.() ?? false));
    ipcMain.handle('win:setFullScreen', (_e, on) => { if (win) win.setFullScreen(!!on); });
    ipcMain.handle('win:toggleFullScreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
    ipcMain.handle('win:rightGrowCapacity', () => rightGrowCapacity(win));

    ipcMain.handle('notes:load', () => readNotesFile());
    ipcMain.handle('notes:save', (_e, payload) => writeNotesFile(payload));
    ipcMain.handle('notes:backup', () => backupNotesFile());

    // Windows/Linux: animate on restore from taskbar
    win.on('restore', async () => {
        if (wasGenieMinimized) await animateGenieRestore();
    });
}

// ---- persistence helpers ----
function dataPaths() {
    const dir = app.getPath('userData');
    return {
        dir,
        notes: path.join(dir, 'notes.json'),
        tmp: path.join(dir, 'notes.tmp.json'),
        bak: path.join(dir, `notes.${Date.now()}.bak.json`)
    };
}

async function readNotesFile() {
    const { notes } = dataPaths();
    try { return JSON.parse(await fsp.readFile(notes, 'utf8')); }
    catch { return null; }
}

async function writeNotesFile(payload) {
    const { dir, notes, tmp } = dataPaths();
    await fsp.mkdir(dir, { recursive: true });
    const json = JSON.stringify(payload, null, 2);
    await fsp.writeFile(tmp, json, 'utf8');
    await fsp.rename(tmp, notes); // atomic-ish on same volume
}

async function backupNotesFile() {
    const { notes, bak } = dataPaths();
    try { await fsp.copyFile(notes, bak); } catch { }
}


// ===== App lifecycle =====
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// macOS: Dock icon click → restore or create
app.on('activate', async () => {
    // If no window, create one
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        return;
    }
    if (!win) return;

    if (wasGenieMinimized) {
        await animateGenieRestore();
    } else {
        win.show();
    }
});
