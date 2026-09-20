/**
 * Type declarations for the Tauri IPC bridge and legacy Electron bridge.
 *
 * The app uses Tauri v2 for OS-level window tracking. The Electron types
 * are kept for reference but are not used at runtime.
 */

// ─── Shared Payload Types ────────────────────────────────────────────────────

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

// ─── Legacy Electron Bridge (unused — kept for reference) ────────────────────

interface ElectronBridge {
  onWindowChanged: (callback: (payload: ActiveWindowPayload) => void) => () => void;
  getActiveWindow: () => Promise<ActiveWindowPayload | null>;
  setTrackingEnabled: (enabled: boolean) => void;
  setSessionIntent: (intent: string | { intent: string; workspaceId?: number }) => void;
  onActivityClassified: (callback: (payload: ActivityClassifiedPayload) => void) => () => void;
}

// ─── Tauri Runtime Detection ─────────────────────────────────────────────────

interface Window {
  electronBridge?: ElectronBridge;
  /** Tauri v2 injects this object at runtime — used for environment detection */
  __TAURI_INTERNALS__?: unknown;
}