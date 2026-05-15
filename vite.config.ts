/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import manifest from './src/manifest.config';

export default defineConfig({
    plugins: [crx({ manifest })],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: 'inline',
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.test.ts'],
    },
});
