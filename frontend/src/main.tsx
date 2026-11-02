import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { API_BASE } from './lib/config'

// Fire-and-forget ping to wake Render server from cold start
fetch(`${API_BASE}/health`).catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
