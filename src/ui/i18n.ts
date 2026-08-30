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
    createCharacter: 'Start creating',
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
      character: 'Character draft',
    },
    stages: 'Stages',
    initialStage: 'Initial stage',
    entries: 'Entries',
    assets: 'Assets',
    appearances: 'Appearances',
    approve: 'Activate companion',
    activating: 'Activating…',
    cancel: 'Not now',
  },
  characterDraft: {
    title: 'Create your character',
    description: 'Fill the two required sprites first. Every asset stays on the exact 512×768 canvas so the layers remain aligned.',
    assetsTitle: 'Sprite slots',
    agentReady: 'Upload sprites yourself, or let the connected agent fill these candidate slots through WebMCP.',
    agentUnavailable: 'Uploads still work. Open this page in a WebMCP browser to let an agent fill slots.',
    empty: 'Empty sprite',
    required: 'Required',
    fromAgent: 'Candidate from agent',
    upload: 'Upload PNG',
    replace: 'Replace',
    missingRequired: 'Add the base body and neutral whole-head expression to continue.',
    useOutfit: 'Preview outfit',
    useBase: 'Preview base',
    useHappy: 'Preview happy',
    useNeutral: 'Preview neutral',
    roles: {
      'body-base': { title: 'Base body', description: 'Full-body skin with fixed hair and facial hair.' },
      'head-neutral': { title: 'Neutral head', description: 'The complete aligned head, not cropped facial features.' },
      'head-happy': { title: 'Happy head', description: 'Optional complete head with the same fixed hair.' },
      'body-outfit': { title: 'Outfit', description: 'Optional complete full-body skin.' },
      'prop-back': { title: 'Prop · back', description: 'Optional layer behind the character.' },
      'prop-front': { title: 'Prop · front', description: 'Optional layer in front of the character.' },
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
