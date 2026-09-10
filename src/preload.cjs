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
  openCanvasLogin: () => invoke('canvas:login'),
  verifyCanvas: () => invoke('canvas:verify'),
  connectCanvasToken: token => invoke('canvas:token', token),
  disconnectCanvas: () => invoke('canvas:disconnect'),
  setCanvasOrigin: origin => invoke('settings:canvas', origin),
  selectCourses: ids => invoke('courses:select', ids),
  updateGuide: () => invoke('guide:update'),
  cancelRefresh: () => invoke('guide:cancel'),
  openGuide: () => invoke('guide:open'),
  connectChatGPT: () => invoke('ai:login'),
  checkChatGPT: () => invoke('ai:check'),
  disconnectChatGPT: () => invoke('ai:logout'),
  setAIEnabled: enabled => invoke('settings:ai', enabled),
  chooseCodex: () => invoke('settings:codex'),
  onStateChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
});
