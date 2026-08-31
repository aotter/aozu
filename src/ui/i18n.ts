import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const en = {
  common: {
    productName: 'Companion',
    back: 'Back',
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
    createPreset: 'Choose preset',
    createCharacter: 'Start creating',
    saved: {
      title: 'Saved companions',
      current: 'Current companion',
      continue: 'Continue',
      open: 'Open',
      delete: 'Delete',
      confirmDelete: 'Delete {{name}} and all of its local data?',
      deleteError: 'The companion could not be deleted.',
    },
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
    required: 'Required',
    missingRequired: 'Add the base body and neutral whole-head expression to continue.',
    variantLabel: 'Variant name',
    editVariant: 'Edit {{name}}',
    review: 'Review',
    ready: 'Your required character layers are ready to validate.',
    customizeTitle: 'Customize appearance',
    categorySwitcher: 'Appearance categories',
    backToVariants: 'Back to variants',
    none: 'None',
    baseTitle: 'Base character',
    layerReady: 'Ready',
    layerMissing: 'Missing',
    neutralExpression: 'Neutral expression',
    categories: {
      expressions: 'Expressions',
      outfits: 'Outfits',
      props: 'Props',
    },
    layers: {
      body: 'Body',
      head: 'Head',
      primary: 'Primary sprite',
      behindOptional: 'Behind character · Optional',
    },
    groups: {
      expression: { add: 'Add expression', variantName: 'Expression' },
      outfit: { add: 'Add outfit', variantName: 'Outfit' },
      prop: { add: 'Add prop', variantName: 'Prop' },
    },
  },
  navigation: {
    primary: 'Primary navigation',
    openMenu: 'Open menu',
    menu: 'Feature menu',
    description: 'Choose an area to open.',
    items: {
      start: 'Start',
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
    sceneLabel: '{{name}} scene',
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
