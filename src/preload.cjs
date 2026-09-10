const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

contextBridge.exposeInMainWorld('canvasWeekly', {
  getState: () => invoke('state:get'),
  setTheme: theme => invoke('settings:theme', theme),
  chooseOutput: () => invoke('settings:output'),
  openOutput: () => invoke('output:open'),
  onStateChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
});
