import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const en = {
  common: {
    productName: 'Companion',
    close: 'Close',
  },
  startup: {
    loading: 'Loading local data…',
    error: 'Local data could not be loaded. Refresh and try again.',
  },
  start: {
    title: 'Create your companion',
    description: 'Choose how to begin. Confirmed data is saved locally.',
    unavailable: 'Not available yet',
    options: {
      custom: {
        title: 'Create a character',
        description: 'Start with a character identity and description.',
      },
      preset: {
        title: 'Choose a preset',
        description: 'Preview a character, story, and tasks.',
      },
      bundle: {
        title: 'Import a bundle',
        description: 'Validate and restore a local file.',
      },
    },
  },
  navigation: {
    primary: 'Primary navigation',
    openMenu: 'Open menu',
    menu: 'Feature menu',
    description: 'Choose an area to open.',
    items: {
      character: 'Character',
      wardrobe: 'Wardrobe',
      story: 'Story',
      tasks: 'Tasks',
      journal: 'Journal',
      data: 'Data',
      settings: 'Settings',
    },
  },
  main: {
    webmcpConnected: 'WebMCP connected',
    webmcpUnavailable: 'WebMCP unavailable',
    stageTitle: '2D character and scene stage',
    placeholder: 'Placeholder',
    dialogueTitle: 'Dialogue',
    dialoguePlaceholder: 'Dialogue placeholder',
  },
} as const

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  interpolation: { escapeValue: false },
})

export default i18n
