import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packages = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@polyhymnia\/notation-model$/, replacement: `${packages}notation-model/src/index.ts` },
      { find: /^@polyhymnia\/notation-engine$/, replacement: `${packages}notation-engine/src/index.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
