// main.js — grow/shrink RIGHT with real async (Promises resolve on completion)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;
let animating = false;
let lastDelta = 0;

function animateGrowRight(delta, duration = 260) {
    if (!win || animating || delta <= 0) return Promise.resolve(0);

    return new Promise((resolve) => {
        const b0 = win.getBounds();
        animating = true;
        const steps = Math.max(1, Math.round(duration / 16));
        let i = 0;

        // console.log('[MAIN] grow: start', { delta, duration, b0 });

        const tick = () => {
            i++;
            const t = i / steps;
            const ease = 1 - Math.pow(1 - t, 3); // ease-out
            const cur = Math.round(delta * ease);

            // Keep 'x' the same, only increase 'width'
            win.setBounds({ x: b0.x, width: b0.width + cur, y: b0.y, height: b0.height }, true);

            if (i < steps) {
                setTimeout(tick, 16);
            } else {
                animating = false;
                lastDelta = delta;
                // const b1 = win.getBounds();
                // console.log('[MAIN] grow: done', { finalBounds: b1, lastDelta });
                resolve(delta);
            }
        };

        tick();
    });
}

function animateShrinkRight(delta, duration = 260) {
    if (!win || animating) return Promise.resolve(0);

    const used = Math.max(0, Math.min(delta || lastDelta, lastDelta));
    if (used <= 0) {
        lastDelta = 0;
        return Promise.resolve(0);
    }

    return new Promise((resolve) => {
        const b0 = win.getBounds();
        animating = true;
        const steps = Math.max(1, Math.round(duration / 16));
        let i = 0;

        // console.log('[MAIN] shrink: start', { used, duration, b0 });

        const tick = () => {
            i++;
            const t = i / steps;
            const ease = Math.pow(t, 3); // ease-in
            const cur = Math.round(used * ease);

            // Keep 'x' the same, only decrease 'width'
            win.setBounds({ x: b0.x, width: b0.width - cur, y: b0.y, height: b0.height }, true);

            if (i < steps) {
                setTimeout(tick, 16);
            } else {
                animating = false;
                lastDelta = 0;
                // const b1 = win.getBounds();
                // console.log('[MAIN] shrink: done', { finalBounds: b1, lastDelta });
                resolve(used);
            }
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
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    win.setMinimumSize(400, 350);
    win.loadFile('index.html');

    // Important: return Promises so ipcRenderer.invoke() truly awaits animation end
    ipcMain.handle('win:smoothGrowRight', async (_e, px, ms) =>
        animateGrowRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
    ipcMain.handle('win:smoothShrinkRight', async (_e, px, ms) =>
        animateShrinkRight(Math.max(0, px | 0), Math.max(0, ms | 0))
    );
    ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
    ipcMain.handle('win:close', () => { if (win) win.close(); });

}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
