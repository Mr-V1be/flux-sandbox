import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: [
        'src/core/**/*.ts',
        'src/elements/registry.ts',
        'src/rendering/Camera.ts',
        'src/state/Serializer.ts',
      ],
      exclude: ['src/**/*.d.ts'],
    },
  },
});
