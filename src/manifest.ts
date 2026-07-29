import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';
import { COMMAND_ID } from './shared/constants';

const { version } = packageJson;

// Least privilege (spec §9): no <all_urls>. activeTab + optional per-site host grants
// requested on demand, plus scripting to inject into the granted tab and storage for config.
export default defineManifest({
  manifest_version: 3,
  name: 'Pixly',
  description:
    'Extensible visual web-dev toolset: fix broken images and overlay design exports on real pages.',
  version,
  action: {
    default_title: 'Pixly',
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  permissions: ['activeTab', 'storage', 'scripting'],
  optional_host_permissions: ['*://*/*'],
  // High-frequency actions get keyboard shortcuts so the on-page widget can stay minimized.
  // Users can rebind them at chrome://extensions/shortcuts.
  commands: {
    [COMMAND_ID.toggleToolbar]: {
      suggested_key: { default: 'Alt+Shift+P' },
      description: 'Expand or collapse the Pixly toolbar on the current page',
    },
    [COMMAND_ID.toggleOverlay]: {
      suggested_key: { default: 'Alt+Shift+O' },
      description: 'Show or hide the image overlay on the current page',
    },
  },
});
