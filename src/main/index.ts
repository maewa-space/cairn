import { app, BrowserWindow, shell, session } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc/index.js';
import { seedTemplates } from './services/db.js';
import { loadBuiltInTemplates } from '@shared/templates/loader-node.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fafaf7',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Auto-grant media permissions for our own renderer (mic + screen capture).
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      if (
        permission === 'media' ||
        permission === 'display-capture' ||
        permission === 'mediaKeySystem'
      ) {
        callback(true);
        return;
      }
      callback(false);
    },
  );

  // Forward getDisplayMedia requests so renderer can pick a source.
  if ('setDisplayMediaRequestHandler' in mainWindow.webContents.session) {
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        // Default to first screen with audio. Renderer can override later.
        import('electron').then(({ desktopCapturer }) => {
          desktopCapturer
            .getSources({ types: ['screen'] })
            .then((sources) => {
              callback({ video: sources[0], audio: 'loopback' });
            })
            .catch(() => callback({}));
        });
      },
      { useSystemPicker: false },
    );
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  // Seed built-in templates on first run / on every launch (idempotent upsert).
  try {
    const templates = loadBuiltInTemplates(
      app.isPackaged
        ? join(process.resourcesPath, 'app.asar.unpacked/src/shared/templates')
        : join(__dirname, '../../src/shared/templates'),
    );
    seedTemplates(templates);
  } catch (err) {
    console.error('Template seeding failed:', err);
  }

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
