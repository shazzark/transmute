import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The domain and application layers are deliberately Node-clean (TR-21), so
    // no React Native or jsdom environment is needed or wanted.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: 'default',
  },
});
