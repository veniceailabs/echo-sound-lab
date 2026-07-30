const { contextBridge, ipcRenderer } = require('electron');
console.log('--- PRELOAD SCRIPT RUNNING ---');

contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  readFile: (filePath, encoding) => ipcRenderer.invoke('fs:readFile', filePath, encoding),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  runOfflineLab: (command, cwd) => ipcRenderer.invoke('exec:runOfflineLab', command, cwd),
  requestMicrophoneAccess: () => ipcRenderer.invoke('system:requestMicrophoneAccess')
});

// Native C++ audio core. Desktop-only -- absent in the browser build, so the
// renderer must check isAvailable() before using any of it.
contextBridge.exposeInMainWorld('eslNative', {
  isAvailable: () => ipcRenderer.invoke('nativeAudio:isAvailable'),
  listInputDevices: () => ipcRenderer.invoke('nativeAudio:listInputDevices'),
  startRecording: (options) => ipcRenderer.invoke('nativeAudio:startRecording', options),
  recordingStatus: () => ipcRenderer.invoke('nativeAudio:recordingStatus'),
  stopRecording: () => ipcRenderer.invoke('nativeAudio:stopRecording'),
  masterFile: (options) => ipcRenderer.invoke('nativeAudio:masterFile', options),
  processVocal: (options) => ipcRenderer.invoke('nativeAudio:processVocal', options)
});
