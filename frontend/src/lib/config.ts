/**
 * Application configuration derived from environment variables.
 * Allows overriding API and WebSocket hosts for different environments
 * (development, production, Docker, etc.) without hardcoding.
 */
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
export const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:8000';

/**
 * Derives the WebSocket base URL from the current page origin.
 * Automatically upgrades to wss:// when the page is served over HTTPS,
 * avoiding mixed-content blocking in Firefox and Safari.
 */
export function getWsUrl(path: string): string {
  if (import.meta.env.VITE_WS_BASE) {
    return `${import.meta.env.VITE_WS_BASE}${path}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_API_HOST || window.location.host;
  return `${protocol}//${host}${path}`;
}