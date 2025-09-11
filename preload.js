// preload.js — expose window grow/shrink helpers to the renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('win', {
    smoothGrowRight: (px, ms = 260) => ipcRenderer.invoke('win:smoothGrowRight', px, ms),
    smoothShrinkRight: (px, ms = 260) => ipcRenderer.invoke('win:smoothShrinkRight', px, ms),
    minimize: () => ipcRenderer.invoke('win:minimize'),
    close: () => ipcRenderer.invoke('win:close'),

});
