import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createApplication } from './bootstrap.ts'
import './index.css'
import './ui/i18n.ts'
import App from './ui/App.tsx'

const application = createApplication(document)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App loadStartup={application.loadStartup} />
  </StrictMode>,
)
