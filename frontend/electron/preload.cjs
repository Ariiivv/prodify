const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure IPC bridge for OS window tracking.
 *
 * Exposes a minimal `electronBridge` API to the renderer process so that
 * React hooks can listen for active-window changes without granting
 * direct Node.js access to the renderer.
 */
contextBridge.exposeInMainWorld('electronBridge', {
  /**
   * Listen for active OS window changes emitted by the main process.
   * @param callback - receives { title, processName, timestamp }
   * @returns an unsubscribe function
   */
  onWindowChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('os-window-changed', handler);
    return () => {
      ipcRenderer.removeListener('os-window-changed', handler);
    };
  },

  /**
   * Request the current active window info on demand.
   * @returns {Promise<{ title: string, processName: string, timestamp: number } | null>}
   */
  getActiveWindow: () => {
    return ipcRenderer.invoke('get-active-window');
  },

  /**
   * Enable or disable the OS window polling loop from the renderer.
   * @param enabled {boolean}
   */
  setTrackingEnabled: (enabled) => {
    ipcRenderer.send('set-tracking-enabled', enabled);
  },
});