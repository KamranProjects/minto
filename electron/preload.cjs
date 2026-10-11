const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cozy", {
  getSnapshot: () => ipcRenderer.invoke("focus:get"),
  dispatch: (command) => ipcRenderer.invoke("focus:command", command),
  subscribe: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot);
    ipcRenderer.on("focus:state", handler);
    return () => ipcRenderer.removeListener("focus:state", handler);
  },
  window: (action) => ipcRenderer.invoke("focus:window", action),
  exportBackup: () => ipcRenderer.invoke("focus:export"),
  resetAll: () => ipcRenderer.invoke("focus:reset"),
});
