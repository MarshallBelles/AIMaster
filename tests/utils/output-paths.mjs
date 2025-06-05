/**
 * Centralized output path management for AIMaster testing
 * This utility helps ensure all test artifacts go to the output directory
 */

import path from 'path';
import { getOutputPath } from './test-helpers.mjs';

/**
 * Generate test file paths that go to output directory
 * @param {string} testName - Name of the test (for creating unique files)
 * @param {string} fileType - Type of file (txt, json, md, etc.)
 * @param {string} category - Output category (tests, reports, artifacts, etc.)
 * @returns {string} Full path to output file
 */
export function createTestFilePath(testName, fileType = 'txt', category = 'tests') {
  const timestamp = Date.now();
  const filename = `${testName}-${timestamp}.${fileType}`;
  return getOutputPath(filename, category);
}

/**
 * Generate paths for common test file types
 */
export const createTestPaths = {
  report: (testName) => createTestFilePath(testName, 'md', 'reports'),
  log: (testName) => createTestFilePath(testName, 'log', 'logs'),
  json: (testName) => createTestFilePath(testName, 'json', 'artifacts'),
  temp: (testName) => createTestFilePath(testName, 'txt', 'temp'),
  artifact: (testName, ext) => createTestFilePath(testName, ext, 'artifacts')
};

/**
 * Predefined test file paths for common scenarios
 */
export const commonTestFiles = {
  // Basic operations
  writeTest: () => getOutputPath('test-write.txt'),
  readTest: () => getOutputPath('test-read.txt'),
  copySource: () => getOutputPath('copy-source.txt'),
  copyTarget: () => getOutputPath('copy-target.txt'),
  
  // Templating tests
  templateInput: () => getOutputPath('template-input.txt'),
  templateOutput: () => getOutputPath('template-output.txt'),
  templateSummary: () => getOutputPath('template-summary.md'),
  
  // Workflow tests
  workflowReport: () => getOutputPath('workflow-report.md', 'reports'),
  analysisReport: () => getOutputPath('analysis-report.json', 'artifacts'),
  
  // Error and debug files
  errorLog: () => getOutputPath('error-test.log', 'logs'),
  debugOutput: () => getOutputPath('debug-output.txt', 'temp')
};

export default {
  createTestFilePath,
  createTestPaths,
  commonTestFiles
};