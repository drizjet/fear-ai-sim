const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Fear-AI Evolution Simulator: Omniverse Suite (Native)",
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true // Absolute security & privacy
    }
  });

  // Load the simulator - prefer built files (dist/) if available, fall back to source
  const fs = require('fs');
  const distPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distPath)) {
    console.log('[ELECTRON] Loading built app from dist/index.html');
    win.loadFile(distPath);
  } else {
    console.log('[ELECTRON] Loading source app from index.html');
    win.loadFile(path.join(__dirname, 'index.html'));
  }
  
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Remove the default menu for a clean software app feel
  win.setMenu(null);
  
  // DevTools — only in development (packaged app = production)
  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Forward console logs to terminal
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Browser Console] L${line} ${message}`);
  });
}

// Security: Disable all navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    event.preventDefault();
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
