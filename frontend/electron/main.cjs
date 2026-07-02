const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// ─── Detect Dev / Prod ───────────────────────────────────────────────────────────
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

let mainWindow = null;
let activeWinModule = null;

// ─── Create the BrowserWindow ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Prodify',
    backgroundColor: '#0f172a', // slate-900
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for active-win via preload
    },
  });

  if (isDev) {
    // In development, load the Vite dev server
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    // DevTools are available via the application menu (View → Toggle Developer Tools)
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── OS Window Tracking ──────────────────────────────────────────────────────────
async function loadActiveWin() {
  try {
    // active-win is ESM-only; use dynamic import from CJS
    activeWinModule = await import('active-win');
  } catch (err) {
    console.error('[Prodify] Failed to load active-win:', err.message);
    console.error('[Prodify] OS window tracking will be unavailable.');
    activeWinModule = null;
  }
}

let trackingInterval = null;
let lastWindowIdentifier = null;

/**
 * Poll the active window every 1 000 ms and emit changes over IPC.
 * Uses a composite key (title + process name) to detect real switches.
 */
async function pollActiveWindow() {
  if (!activeWinModule || !mainWindow || mainWindow.isDestroyed()) return;

  try {
    const win = await activeWinModule.activeWindow();
    if (!win) return; // no active window (lock screen, etc.)

    const title = win.title || '';
    const processName = win.owner?.name || win.owner?.processId || '';
    const compositeKey = `${processName}::${title}`;

    // Only emit when the active window actually changes
    if (compositeKey !== lastWindowIdentifier) {
      lastWindowIdentifier = compositeKey;

      const payload = {
        title,
        processName,
        timestamp: Date.now(),
      };

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('os-window-changed', payload);
      }
    }
  } catch (err) {
    // Silently ignore transient errors (rapid focus changes, permissions, etc.)
    if (err.code !== 'ESRCH' && err.code !== 'EPERM') {
      console.warn('[Prodify] active-win poll error:', err.message);
    }
  }
}

function startTracking() {
  if (trackingInterval) return;
  trackingInterval = setInterval(pollActiveWindow, 1000);
}

function stopTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  lastWindowIdentifier = null;
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────────
function setupIPC() {
  // Renderer requests the current active window info on demand
  ipcMain.handle('get-active-window', async () => {
    if (!activeWinModule) return null;
    try {
      const win = await activeWinModule.activeWindow();
      if (!win) return null;
      return {
        title: win.title || '',
        processName: win.owner?.name || '',
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  });

  // Renderer can toggle tracking at runtime
  ipcMain.on('set-tracking-enabled', (_event, enabled) => {
    if (enabled) {
      startTracking();
    } else {
      stopTracking();
    }
  });
}

// ─── Electron Permissions ───────────────────────────────────────────────────────
app.on('web-contents-created', (_event, contents) => {
  // Allow camera access for WebRTC / react-webcam
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'notifications'];
    const allowed = allowedPermissions.includes(permission);
    if (!allowed) {
      console.warn(`[Prodify] Denied permission: ${permission}`);
    }
    callback(allowed);
  });

  // Also handle permission checks (Chromium's newer API)
  contents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const allowedPermissions = ['media', 'mediaKeySystem'];
    return allowedPermissions.includes(permission);
  });
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await loadActiveWin();
  setupIPC();
  createWindow();

  // Start OS window tracking by default
  startTracking();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopTracking();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopTracking();
});