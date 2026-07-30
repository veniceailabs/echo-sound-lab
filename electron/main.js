import { app, BrowserWindow, shell, ipcMain, dialog, systemPreferences } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import * as nativeAudio from './native-audio.js';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0f1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// --- IPC Handlers for Native File System & Offline Execution ---

ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('fs:readFile', async (event, filePath, encoding = 'utf-8') => {
  if (encoding === 'buffer') {
    return await fs.promises.readFile(filePath);
  }
  return await fs.promises.readFile(filePath, { encoding });
});

ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
  return await fs.promises.writeFile(filePath, data);
});

ipcMain.handle('fs:mkdir', async (event, dirPath) => {
  return await fs.promises.mkdir(dirPath, { recursive: true });
});

ipcMain.handle('fs:copyFile', async (event, src, dest) => {
  return await fs.promises.copyFile(src, dest);
});

ipcMain.handle('fs:readDir', async (event, dirPath) => {
  const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
  return dirents.map(dirent => ({
    name: dirent.name,
    isDirectory: dirent.isDirectory()
  }));
});

ipcMain.handle('fs:stat', async (event, filePath) => {
  const stats = await fs.promises.stat(filePath);
  return {
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    size: stats.size,
    mtime: stats.mtime
  };
});

ipcMain.handle('app:getPath', async (event, name) => {
  return app.getPath(name);
});

ipcMain.handle('exec:runOfflineLab', async (_, command, cwd) => {
  try {
    const { stdout, stderr } = await execPromise(command, { cwd });
    return { stdout, stderr };
  } catch (error) {
    console.error('Offline lab execution failed:', error);
    throw error;
  }
});

ipcMain.handle('system:requestMicrophoneAccess', async () => {
  if (process.env.ESL_TEST_MODE === '1') {
    return true; // Auto-pass for automated QA testing
  }
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') return true;
    const result = await systemPreferences.askForMediaAccess('microphone');
    return result;
  }
  // Windows/Linux typically handle this automatically via chromium
  return true;
});

// --- Native audio core (desktop only) ---
// These are no-ops in the browser build; the renderer must feature-detect via
// nativeAudio:isAvailable before offering hardware capture or native mastering.

ipcMain.handle('nativeAudio:isAvailable', async () => nativeAudio.isAvailable());

ipcMain.handle('nativeAudio:listInputDevices', async () => nativeAudio.listInputDevices());

ipcMain.handle('nativeAudio:startRecording', async (_, options) =>
  nativeAudio.startRecording(options));

ipcMain.handle('nativeAudio:recordingStatus', async () => nativeAudio.recordingStatus());

ipcMain.handle('nativeAudio:stopRecording', async () => nativeAudio.stopRecording());

ipcMain.handle('nativeAudio:masterFile', async (_, options) => nativeAudio.masterFile(options));

ipcMain.handle('nativeAudio:processVocal', async (_, options) => nativeAudio.processVocal(options));

app.whenReady().then(() => {
  nativeAudio.loadNative();  // surface load failures at startup, not first use
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
