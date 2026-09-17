import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './questionarioLayoutEnhancements.js'
import './questionarioTextPreviewValues.js'
import './questionarioPreviewPdfValues.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
