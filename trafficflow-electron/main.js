const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Initialize persistent storage
const store = new Store({
  name: 'trafficflow-data',
  defaults: {
    campaigns: [],
    settings: {
      general: {
        timezone: 'UTC',
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        weekStart: 'Sunday',
        email: 'admin@trafficflow.local'
      },
      notifications: {
        email: true,
        push: true,
        sms: false,
        digest: 'daily'
      },
      security: {
        twoFactor: false,
        sessionTimeout: 30,
        ipWhitelist: []
      },
      billing: {
        plan: 'Professional',
        nextBilling: '2025-02-15',
        paymentMethod: 'Visa ****4242'
      }
    },
    analytics: {
      totalVisitors: 0,
      uniqueVisitors: 0,
      totalPageViews: 0,
      avgSessionDuration: 0,
      bounceRate: 0,
      trafficData: [],
      dailyStats: []
    },
    seoData: {
      domainAuthority: 1,
      backlinks: 0,
      topicalAuthority: 0,
      opportunityScore: 0,
      keywords: [],
      technicalIssues: [],
      contentGaps: [],
      competitorGaps: []
    }
  }
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    title: 'TrafficFlow v18.0 Enterprise',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#0f172a'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC Handlers for data persistence
ipcMain.handle('get-data', (event, key) => {
  return store.get(key);
});

ipcMain.handle('set-data', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('delete-data', (event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle('get-all-data', () => {
  return store.store;
});

ipcMain.handle('clear-all-data', () => {
  store.clear();
  return true;
});

ipcMain.handle('export-data', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export TrafficFlow Data',
    defaultPath: `trafficflow-backup-${Date.now()}.json`,
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });
  
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, JSON.stringify(store.store, null, 2));
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('import-data', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import TrafficFlow Data',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      Object.keys(data).forEach(key => store.set(key, data[key]));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false };
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});
