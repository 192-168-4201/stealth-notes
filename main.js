// main.js — grow/shrink LEFT and report exact delta (px) to the renderer
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');


// function clampGrowLeftDelta(bounds, desired) {
//     const disp = screen.getDisplayMatching(bounds);
//     const leftLimit = disp.workArea.x;
//     const maxDelta = Math.max(0, bounds.x - leftLimit);
//     return Math.min(desired, maxDelta);
// }

let win;
let animating = false;
let lastDelta = 0;

// NEW: Animated function to grow the window to the right
function animateGrowRight(delta, duration = 260) {
    if (!win || animating || delta <= 0) return 0;
    const b0 = win.getBounds();
    animating = true;
    const steps = Math.max(1, Math.round(duration / 16));
    let i = 0;

    const tick = () => {
        i++;
        const t = i / steps;
        // Using an ease-out curve similar to the original project
        const ease = 1 - Math.pow(1 - t, 3);
        const cur = Math.round(delta * ease);

        // Keep 'x' the same, only increase 'width'
        win.setBounds({ x: b0.x, width: b0.width + cur, y: b0.y, height: b0.height }, true);

        if (i < steps) setTimeout(tick, 16);
        else { animating = false; lastDelta = delta; }
    };
    tick();
    return delta;
}

// NEW: Animated function to shrink from the right
function animateShrinkRight(delta, duration = 260) {
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
        const ease = Math.pow(t, 3); // ease-in curve
        const cur = Math.round(used * ease);

        // Keep 'x' the same, only decrease 'width'
        win.setBounds({ x: b0.x, width: b0.width - cur, y: b0.y, height: b0.height }, true);

        if (i < steps) setTimeout(tick, 16);
        else { animating = false; lastDelta = 0; }
    };
    tick();
    return used;
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

    ipcMain.handle('win:smoothGrowRight', (_e, px, ms) =>
        animateGrowRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
    ipcMain.handle('win:smoothShrinkRight', (_e, px, ms) =>
        animateShrinkRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
