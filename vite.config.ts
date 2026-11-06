/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';

/**
 * IWER (IWSDK's browser-based WebXR emulator) normally activates only by
 * hostname (`localhost`). This lets `?emulate=1` turn it on for any host, in
 * both the dev server and the production build (which injects IWER because
 * `dev.emulator.injectOnBuild` is set in iwsdk.config.json). Without the flag,
 * dev keeps the localhost default and production never emulates, so real
 * WebXR browsers and headsets are untouched.
 */
function emulateUrlFlag(): Plugin {
  const RUNTIME_MODULE = '\0/@iwer-injection-runtime';
  const START_CALL = /startIwsdkDevRuntime\((\{[\s\S]*?\})\);/;
  let isBuild = false;
  return {
    name: 'deeproom:emulate-url-flag',
    enforce: 'post',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transform(code, id) {
      if (id !== RUNTIME_MODULE) return null;
      if (!START_CALL.test(code)) {
        this.warn('IWER runtime start call not found; ?emulate=1 is inactive');
        return null;
      }
      const fallback = isBuild ? "'off'" : 'cfg.activation';
      return code.replace(
        START_CALL,
        (_match, cfg: string) => `const cfg = ${cfg};
let emulate = false;
try { emulate = new URLSearchParams(location.search).get('emulate') === '1'; } catch {}
cfg.activation = emulate ? 'always' : ${fallback};
startIwsdkDevRuntime(cfg);`,
      );
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), emulateUrlFlag()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
