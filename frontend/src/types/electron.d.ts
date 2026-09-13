/**
 * Type declarations for the Electron IPC bridge exposed by the preload script.
 */

interface ActiveWindowPayload {
  title: string;
  processName: string;
  timestamp: number;
}

interface ActivityClassifiedPayload {
  status: 'focused' | 'distracted';
  reason: string;
  window_title: string;
  app_name: string;
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

  /**
   * Send the workspace's natural-language session intent to the main process.
   * Included in every activity API call for Gemini-based focus evaluation.
   */
  setSessionIntent: (intent: string | { intent: string; workspaceId?: number }) => void;

  /**
   * Listen for backend classification verdicts (focused vs distracted + AI reason).
   */
  onActivityClassified: (callback: (payload: ActivityClassifiedPayload) => void) => () => void;
}

interface Window {
  electronBridge?: ElectronBridge;
}