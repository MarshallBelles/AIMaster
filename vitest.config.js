import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,mjs,ts}'],
    exclude: ['tests/fixtures/**/*', 'node_modules/**/*', 'output/**/*'],
    testTimeout: 30000, // 30 seconds for E2E tests
    hookTimeout: 10000,  // 10 seconds for setup/teardown
    pool: 'forks',       // Use separate processes for isolation
    reporters: ['verbose'],
    outputFile: {
      json: './output/reports/test-results.json',
      html: './output/reports/test-results.html'
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './output/reports/coverage',
      exclude: ['tests/**/*', 'node_modules/**/*', 'output/**/*']
    },
    // Ensure output directory exists before running tests
    globalSetup: ['./tests/utils/global-setup.mjs']
  }
});