const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('win', {
    smoothGrowRight: (px, ms) => ipcRenderer.invoke('win:smoothGrowRight', px, ms),
    smoothShrinkRight: (px, ms) => ipcRenderer.invoke('win:smoothShrinkRight', px, ms),
    minimize: () => ipcRenderer.invoke('win:minimize'),
    close: () => ipcRenderer.invoke('win:close'),
    animateMinimize: () => ipcRenderer.invoke('win:animateMinimize'),
    // NEW
    isFullScreen: () => ipcRenderer.invoke('win:isFullScreen'),
    setFullScreen: (on) => ipcRenderer.invoke('win:setFullScreen', on),
    toggleFullScreen: () => ipcRenderer.invoke('win:toggleFullScreen'),
    rightGrowCapacity: () => ipcRenderer.invoke('win:rightGrowCapacity'),
});