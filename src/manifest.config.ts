import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

const COMMAND_TOGGLE_INSPECTOR = 'toggle-inspector';
const COMMAND_TOGGLE_OVERLAY = 'toggle-overlay';
const COMMAND_TOGGLE_GRID = 'toggle-grid';
const COMMAND_TOGGLE_TYPOGRAPHY = 'toggle-typography';

export default defineManifest({
    manifest_version: 3,
    name: 'Pixly',
    version: pkg.version,
    description: pkg.description,
    icons: {
        16: 'icons/icon-16.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
    },
    action: {
        default_popup: 'src/popup/popup.html',
        default_title: 'Pixly',
        default_icon: {
            16: 'icons/icon-16.png',
            48: 'icons/icon-48.png',
            128: 'icons/icon-128.png',
        },
    },
    background: {
        service_worker: 'src/background/service-worker.ts',
        type: 'module',
    },
    content_scripts: [
        {
            matches: ['<all_urls>'],
            js: ['src/content/content-script.ts'],
            run_at: 'document_idle',
            all_frames: false,
        },
    ],
    permissions: ['storage', 'activeTab', 'scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
    commands: {
        [COMMAND_TOGGLE_INSPECTOR]: {
            suggested_key: {
                default: 'Alt+I',
                mac: 'Alt+I',
            },
            description: 'Toggle element inspector',
        },
        [COMMAND_TOGGLE_OVERLAY]: {
            suggested_key: {
                default: 'Alt+O',
                mac: 'Alt+O',
            },
            description: 'Show/hide image overlay',
        },
        [COMMAND_TOGGLE_GRID]: {
            suggested_key: {
                default: 'Alt+G',
                mac: 'Alt+G',
            },
            description: 'Show/hide grid overlay',
        },
        [COMMAND_TOGGLE_TYPOGRAPHY]: {
            suggested_key: {
                default: 'Alt+T',
                mac: 'Alt+T',
            },
            description: 'Toggle typography inspector',
        },
    },
    web_accessible_resources: [
        {
            resources: ['icons/*'],
            matches: ['<all_urls>'],
        },
    ],
});
