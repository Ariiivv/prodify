/**
 * Type declarations for the Electron IPC bridge exposed by the preload script.
 */

interface ActiveWindowPayload {
  title: string;
  processName: string;
  timestamp: number;
}

interface ElectronBridge {
  /**
   * Listen for active OS window changes emitted by the main process.
   * @returns an unsubscribe function
   */
  onWindowChanged: (callback: (payload: ActiveWindowPayload) => void) => () => void;

  /**
   * Request the current active window info on demand.
   */
  getActiveWindow: () => Promise<ActiveWindowPayload | null>;

  /**
   * Enable or disable the OS window polling loop.
   */
  setTrackingEnabled: (enabled: boolean) => void;
}

interface Window {
  electronBridge?: ElectronBridge;
}