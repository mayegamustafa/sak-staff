import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { initDatabase } from './database';
import { registerIpcHandlers } from './ipc';

const isDev = process.env.NODE_ENV === 'development';

// The app was renamed from "SAK Staff System" to "SAK Staffing". Electron derives
// the data folder (local database, unsynced changes, session) from the product
// name, so keep using the original folder or existing installs would lose it.
if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'SAK Staff System'));
}

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  // Initialise local SQLite database
  await initDatabase();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'SAK Staffing',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // App window icon (platform-specific, loaded from built assets)
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    show: false,
    backgroundColor: '#0f172a',  // Tailwind slate-900
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in browser
  // Only web links go to the system browser – never file:, smb:, or custom
  // protocol handlers that could launch programs on the user's machine.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // The app window itself must never navigate away to another site.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });
}

// Register IPC handlers before window creation
registerIpcHandlers();

app.whenReady().then(createWindow);

// ── Auto-updater ──────────────────────────────────────────────────
app.whenReady().then(() => {
  if (isDev) return; // skip updates in development
  const serverUrl = (process.env.SAK_SERVER_URL || 'http://localhost').replace(/\/$/, '');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: 'generic', url: `${serverUrl}/downloads/` });

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Available',
      message: `SAK Staffing v${info.version} is available.`,
      detail: 'The update will be downloaded in the background and installed when you close the app.',
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded.',
      detail: 'Restart the app to apply the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Check silently — do not show error if server unreachable
  autoUpdater.checkForUpdates().catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
