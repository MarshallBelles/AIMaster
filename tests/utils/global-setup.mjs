import { ensureOutputDirs } from './test-helpers.mjs';

export async function setup() {
  // Ensure all output directories exist before running any tests
  await ensureOutputDirs();
  console.log('✅ Output directories initialized for testing');
}

export async function teardown() {
  // Optional: Clean up global resources if needed
  console.log('🧹 Test session cleanup complete');
}