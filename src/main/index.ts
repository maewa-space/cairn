import { app, BrowserWindow, shell } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { registerIpcHandlers } from './ipc/index.js';
import { seedTemplates, seedRecipes } from './services/db.js';
import { startBackgroundRefresh as startCalendarRefresh } from './services/calendar.js';
import { loadBuiltInTemplates } from '@shared/templates/loader-node.js';
import { loadBuiltInRecipes } from '@shared/recipes/loader-node.js';

// `electron-audio-loopback` ships CommonJS; load it via createRequire from
// our ESM main bundle. The package wires up Core Audio tap flags + the
// `setDisplayMediaRequestHandler` for us, and exposes the renderer-side
// `getLoopbackAudioMediaStream()` we'll use instead of raw getDisplayMedia.
const require = createRequire(import.meta.url);
const { initMain } = require('electron-audio-loopback');

// Must be called before `app.whenReady()` — appends the right Chromium
// feature flags (MacLoopbackAudioForScreenShare + Sck/Catap override).
initMain({ forceCoreAudioTap: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    // Responsive layout supports down to ~480px wide; below 900px the sidebar
    // collapses to icons and the meeting page folds the right pane behind a
    // tab. Floor at 420 to keep menus + dialogs sensible.
    minWidth: 420,
    minHeight: 540,
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

  // System audio loopback handler is registered by electron-audio-loopback's
  // initMain() (see top of file). Renderer calls getLoopbackAudioMediaStream()
  // which IPC-handshakes with that handler.

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
        ? join(process.resourcesPath, 'templates')
        : join(__dirname, '../../src/shared/templates'),
    );
    seedTemplates(templates);
  } catch (err) {
    console.error('Template seeding failed:', err);
  }

  try {
    const recipes = loadBuiltInRecipes(
      app.isPackaged
        ? join(process.resourcesPath, 'recipes')
        : join(__dirname, '../../src/shared/recipes'),
    );
    seedRecipes(recipes);
  } catch (err) {
    console.error('Recipe seeding failed:', err);
  }

  registerIpcHandlers();
  // Background calendar refresh — no-ops if no ICS URL is configured. Once
  // the user pastes a URL via Settings the IPC handler triggers a fresh
  // start so they don't have to wait for the next interval tick.
  startCalendarRefresh();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
