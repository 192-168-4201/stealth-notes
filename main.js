// main.js — async grow/shrink + right-edge capacity aware
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let win;
let animating = false;

// How much room exists to grow to the RIGHT within the display work area?
function rightGrowCapacity(win) {
    const b = win.getBounds();
    const disp = screen.getDisplayMatching(b);
    const wa = disp.workArea;                        // excludes taskbar/dock
    const rightEdge = b.x + b.width;
    const waRight = wa.x + wa.width;
    return Math.max(0, waRight - rightEdge);
}

function animateGrowRight(delta, duration = 260) {
    if (!win || animating || delta <= 0) return Promise.resolve(0);
    if (win.isFullScreen && win.isFullScreen()) return Promise.resolve(0);

    const capacity = rightGrowCapacity(win);
    const used = Math.min(delta, capacity);          // clamp to what’s possible
    if (used <= 0) return Promise.resolve(0);

    return new Promise((resolve) => {
        const b0 = win.getBounds();
        animating = true;
        const steps = Math.max(1, Math.round(duration / 16));
        let i = 0;

        const tick = () => {
            i++;
            const t = i / steps;
            const ease = 1 - Math.pow(1 - t, 3);         // ease-out
            const cur = Math.round(used * ease);
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
    const used = Math.max(0, delta | 0);             // shrink exactly what we grew
    if (used <= 0) return Promise.resolve(0);

    return new Promise((resolve) => {
        const b0 = win.getBounds();
        animating = true;
        const steps = Math.max(1, Math.round(duration / 16));
        let i = 0;

        const tick = () => {
            i++;
            const t = i / steps;
            const ease = Math.pow(t, 3);                 // ease-in
            const cur = Math.round(used * ease);
            win.setBounds({ x: b0.x, y: b0.y, height: b0.height, width: b0.width - cur }, true);
            if (i < steps) setTimeout(tick, 16);
            else { animating = false; resolve(used); }
        };
        tick();
    });
}

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

    ipcMain.handle('win:smoothGrowRight', async (_e, px, ms) =>
        animateGrowRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
    ipcMain.handle('win:smoothShrinkRight', async (_e, px, ms) =>
        animateShrinkRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );

    ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
    ipcMain.handle('win:close', () => { if (win) win.close(); });
    // NEW: fullscreen + capacity helpers
    ipcMain.handle('win:isFullScreen', () => (win?.isFullScreen?.() ?? false));
    ipcMain.handle('win:setFullScreen', (_e, on) => { if (win) win.setFullScreen(!!on); });
    ipcMain.handle('win:toggleFullScreen', () => {
        if (win) win.setFullScreen(!win.isFullScreen());
    });
    ipcMain.handle('win:rightGrowCapacity', () => rightGrowCapacity(win));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
