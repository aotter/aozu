import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { createApplication } from './bootstrap.ts'
import './index.css'
import './ui/i18n.ts'
import { AppRoutes } from './ui/routes/AppRoutes.tsx'

const application = createApplication(document)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes application={application} />
    </BrowserRouter>
  </StrictMode>,
)
