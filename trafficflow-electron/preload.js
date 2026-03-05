const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Data operations
  getData: (key) => ipcRenderer.invoke('get-data', key),
  setData: (key, value) => ipcRenderer.invoke('set-data', key, value),
  deleteData: (key) => ipcRenderer.invoke('delete-data', key),
  getAllData: () => ipcRenderer.invoke('get-all-data'),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  
  // Import/Export
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  
  // Platform info
  platform: process.platform,
  isElectron: true
});

// Log that preload is working
console.log('TrafficFlow Electron - Preload script loaded');
