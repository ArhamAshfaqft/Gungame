import {studioPoseServer} from './scripts/studio-pose-server.mjs';
import {multiplayerHostInfo} from './scripts/multiplayer-host-info.mjs';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    plugins:[studioPoseServer(),multiplayerHostInfo()],
    server:{watch:{ignored:['**/public/assets/poses/**','**/.pose-backups/**']}},
    build: { rollupOptions: { input: { game: resolve('index.html'), studio: resolve('studio.html'), animationPreview: resolve('animation-preview.html') } } },
});
