import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { captureConsole } from './log'
import { keepFresh } from './serviceWorker'
import { resetChromeViewport } from './viewportReset'
import './index.css'

// Before the first render, so a boot that goes wrong is in the log too.
captureConsole()

// Before it too: on the one browser that needs this, the page is about to
// navigate away and rendering it first would only be thrown away.
resetChromeViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

keepFresh()
