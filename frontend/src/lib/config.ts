/**
 * Application configuration derived from environment variables.
 * Allows overriding API and WebSocket hosts for different environments
 * (development, production, Docker, etc.) without hardcoding.
 */
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
export const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://127.0.0.1:8000';

/**
 * Derives the WebSocket URL for a given path.
 * For local development, uses the explicit WS_BASE host:port to avoid
 * IPv6 localhost resolution issues (browsers resolve `localhost` to `::1`
 * while Uvicorn defaults to IPv4 `127.0.0.1`, causing silent WebSocket hangs).
 *
 * Automatically upgrades to wss:// when the page is served over HTTPS,
 * avoiding mixed-content blocking in Firefox and Safari.
 */
export function getWsUrl(path: string): string {
  if (import.meta.env.VITE_WS_BASE) {
    return `${import.meta.env.VITE_WS_BASE}${path}`;
  }
  // For production / non-VITE_WS_BASE environments, derive from API_BASE
  const base = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
  const wsProtocol = base.startsWith('https') ? 'wss' : 'ws';
  const hostPort = base.replace(/^https?:\/\//, '');
  return `${wsProtocol}://${hostPort}${path}`;
}