/**
 * Application configuration derived from environment variables.
 * Accommodates both VITE_API_URL and VITE_API_BASE to prevent configuration mismatches.
 */
export const API_BASE = 
  import.meta.env.VITE_API_URL || 
  import.meta.env.VITE_API_BASE || 
  'http://127.0.0.1:8000';

/**
 * Derives the WebSocket base URL.
 * Automatically switches to secure wss:// if the API base is secure (HTTPS).
 */
export const WS_BASE = (() => {
  if (import.meta.env.VITE_WS_BASE) {
    return import.meta.env.VITE_WS_BASE;
  }
  // Fallback: Dynamically compute WebSocket base from the API base URL
  const wsProtocol = API_BASE.startsWith('https') ? 'wss' : 'ws';
  const hostPort = API_BASE.replace(/^https?:\/\//, '');
  return `${wsProtocol}://${hostPort}`;
})();

/**
 * Derives the full WebSocket URL for a given path.
 * Automatically handles protocol upgrades (ws -> wss) to avoid mixed-content blocking.
 *
 * @param path - The specific endpoint path (e.g., '/ws/vision' or '/workspaces/stream')
 */
export function getWsUrl(path: string): string {
  // Ensure the path begins with a leading slash if not present
  const standardizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${WS_BASE}${standardizedPath}`;
}