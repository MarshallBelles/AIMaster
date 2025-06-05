import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define output directory paths
export const OUTPUT_DIR = path.resolve(process.cwd(), 'output');
export const TEST_OUTPUT_DIR = path.join(OUTPUT_DIR, 'tests');
export const TEMP_OUTPUT_DIR = path.join(OUTPUT_DIR, 'temp');
export const LOGS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'logs');
export const REPORTS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'reports');
export const ARTIFACTS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'artifacts');

/**
 * Test helpers and utilities for AIMaster E2E tests
 */

/**
 * Ensure output directories exist
 */
export async function ensureOutputDirs() {
  const dirs = [OUTPUT_DIR, TEST_OUTPUT_DIR, TEMP_OUTPUT_DIR, LOGS_OUTPUT_DIR, REPORTS_OUTPUT_DIR, ARTIFACTS_OUTPUT_DIR];
  await Promise.all(dirs.map(dir => fs.mkdir(dir, { recursive: true })));
}

/**
 * Get output file path for test artifacts
 * @param {string} filename - Name of the file
 * @param {string} category - Category (tests, temp, logs, reports, artifacts)
 * @returns {string} Full path to output file
 */
export function getOutputPath(filename, category = 'tests') {
  const categoryDirs = {
    tests: TEST_OUTPUT_DIR,
    temp: TEMP_OUTPUT_DIR,
    logs: LOGS_OUTPUT_DIR,
    reports: REPORTS_OUTPUT_DIR,
    artifacts: ARTIFACTS_OUTPUT_DIR
  };
  
  return path.join(categoryDirs[category] || TEST_OUTPUT_DIR, filename);
}

/**
 * Clean up test files created during testing
 * @param {Array<string>} filePaths - Array of file paths to clean up
 */
export async function cleanupFiles(filePaths) {
  const promises = filePaths.map(async (filePath) => {
    try {
      // Convert relative paths to output directory paths if they don't contain path separators
      let fullPath = filePath;
      if (!path.isAbsolute(filePath) && !filePath.includes('/') && !filePath.includes('\\')) {
        fullPath = getOutputPath(filePath);
      }
      await fs.unlink(fullPath);
    } catch (error) {
      // Ignore file not found errors
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to cleanup file ${fullPath}:`, error.message);
      }
    }
  });
  
  await Promise.allSettled(promises);
}

/**
 * Create a temporary test directory in output/temp
 * @param {string} prefix - Prefix for the temp directory name
 * @returns {Promise<string>} Path to created temp directory
 */
export async function createTempDir(prefix = 'aimaster-test') {
  await ensureOutputDirs();
  const tempDir = path.join(TEMP_OUTPUT_DIR, `${prefix}-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Cleanup temporary test directory
 * @param {string} dirPath - Path to directory to remove
 */
export async function cleanupTempDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup temp directory ${dirPath}:`, error.message);
  }
}

/**
 * Read file content safely (returns null if file doesn't exist)
 * @param {string} filePath - Path to file to read
 * @returns {Promise<string|null>} File content or null
 */
export async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} Whether file exists
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create test fixtures directory structure
 * @param {string} baseDir - Base directory for fixtures
 * @param {Object} structure - Directory structure object
 */
export async function createFixtureStructure(baseDir, structure) {
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = path.join(baseDir, name);
    
    if (typeof content === 'object' && content !== null) {
      // It's a directory
      await fs.mkdir(fullPath, { recursive: true });
      await createFixtureStructure(fullPath, content);
    } else {
      // It's a file
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content || '');
    }
  }
}

/**
 * Wait for a condition to be true with timeout
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>} Whether condition became true
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

/**
 * Assert that a string contains template syntax
 * @param {string} content - Content to check
 * @param {Array<string>} expectedVars - Expected template variables
 */
export function assertTemplateVars(content, expectedVars) {
  for (const varName of expectedVars) {
    const templateRegex = new RegExp(`\\{\\{\\s*${varName.replace('.', '\\.')}\\s*\\}\\}`);
    if (!templateRegex.test(content)) {
      throw new Error(`Template variable {{${varName}}} not found in content: ${content}`);
    }
  }
}

/**
 * Extract template variables from content
 * @param {string} content - Content to analyze
 * @returns {Array<string>} Array of template variable names
 */
export function extractTemplateVars(content) {
  const templateRegex = /\{\{\s*([^}]+)\s*\}\}/g;
  const variables = [];
  let match;
  
  while ((match = templateRegex.exec(content)) !== null) {
    variables.push(match[1].trim());
  }
  
  return variables;
}