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
    createPreset: 'Customize Trail Guide',
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
  draft: {
    title: 'Customize your preset',
    description: 'A preset is only a starting point. Change the supported fields before validation and staging.',
    name: 'Companion name',
    initialTitle: 'Initial scene title',
    narrative: 'Initial scene narrative',
    review: 'Validate and review',
    validating: 'Validating…',
    cancel: 'Not now',
  },
  candidate: {
    title: 'Review before activation',
    description: 'This validated candidate is stored locally but remains inactive until you approve it.',
    source: {
      preset: 'Preset seed',
      import: 'Imported bundle',
    },
    stages: 'Stages',
    initialStage: 'Initial stage',
    entries: 'Entries',
    assets: 'Assets',
    approve: 'Activate companion',
    activating: 'Activating…',
    cancel: 'Not now',
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
    waitingForAgent: 'Waiting for the agent to answer in Companion…',
    messageLabel: 'Message your companion',
    messagePlaceholder: 'Say anything…',
    send: 'Send',
  },
  data: {
    export: 'Export data',
    import: 'Import data',
    busy: 'Working…',
    done: 'Data ready.',
    error: 'The bundle could not be used.',
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
