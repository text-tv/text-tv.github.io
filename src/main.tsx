import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { captureConsole } from './log'
import { keepFresh } from './serviceWorker'
import './index.css'

// Before the first render, so a boot that goes wrong is in the log too.
captureConsole()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

keepFresh()
