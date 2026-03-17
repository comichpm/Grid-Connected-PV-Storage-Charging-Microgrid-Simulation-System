import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Self-hosted Noto Sans SC font – guarantees Chinese rendering without external CDN
// Uses the "chinese-simplified" subset which covers all common Simplified Chinese
// characters in a single woff2 file (~1.1 MB) per weight.
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-700.css'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
