// preload.js — expose window grow/shrink helpers to the renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('win', {
    smoothGrowLeft: (px, ms = 260) => ipcRenderer.invoke('win:smoothGrowLeft', px, ms),
    smoothShrinkLeft: (px, ms = 260) => ipcRenderer.invoke('win:smoothShrinkLeft', px, ms),
});
