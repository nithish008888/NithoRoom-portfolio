import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/fonts'
import './styles.css'
import { App } from './App'
import { detectLowPower } from './lib/device'
import { initRouter } from './state/router'
import { useStore } from './state/store'

useStore.getState().set({ lowPower: detectLowPower() })
initRouter()

// small handle for automated screenshots / the demo recorder (scripts/*.mjs)
;(window as unknown as { __room: unknown }).__room = { store: useStore }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
