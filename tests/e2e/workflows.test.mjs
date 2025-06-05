import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AIMasterClient from '../utils/aimaster-client.mjs';
import { 
  cleanupFiles, 
  readFileSafe, 
  createTempDir, 
  cleanupTempDir,
  createFixtureStructure 
} from '../utils/test-helpers.mjs';

describe('Complex Multi-Tool Workflows', () => {
  let client;
  let tempDir;
  let filesToCleanup = [];

  beforeEach(async () => {
    client = new AIMasterClient();
    tempDir = await createTempDir('workflows');
    filesToCleanup = [];
  });

  afterEach(async () => {
    await cleanupFiles(filesToCleanup);
    await cleanupTempDir(tempDir);
  });

  describe('Project Analysis Workflows', () => {
    it('should analyze a codebase and generate comprehensive report', async () => {
      const reportFile = 'codebase-analysis.md';
      filesToCleanup.push(reportFile);

      const result = await client.executeAndVerify(
        `Analyze the current codebase: list all files, count JavaScript files, search for function definitions, and create a comprehensive markdown report in ${reportFile}`
      );

      expect(result.allSucceeded).toBe(true);
      expect(result.toolResults.length).toBeGreaterThanOrEqual(3);
      
      const content = await readFileSafe(reportFile);
      expect(content).toBeDefined();
      expect(content).toContain('#'); // Should have markdown headers
      expect(content).toMatch(/\d+/); // Should contain metrics
      
      // Should contain analysis results
      expect(content.toLowerCase()).toMatch(/file|function|analysis|report/);
    });

    it('should create project documentation from code analysis', async () => {
      const docFile = 'project-docs.md';
      filesToCleanup.push(docFile);

      const result = await client.executeAndVerify(
        `Create project documentation in ${docFile} by analyzing the codebase structure and extracting key information`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(docFile);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(100);
      
      // Should be structured documentation
      expect(content).toMatch(/#|##|###/); // Headers
      expect(content).not.toMatch(/\{\{.*\}\}/); // No unresolved templates
    });
  });

  describe('File Processing Workflows', () => {
    it('should process multiple files in a coordinated workflow', async () => {
      // Create test files first
      const sourceFiles = ['test1.txt', 'test2.txt', 'test3.txt'];
      const summaryFile = 'file-processing-summary.txt';
      filesToCleanup.push(...sourceFiles, summaryFile);

      // Create source files
      for (let i = 0; i < sourceFiles.length; i++) {
        await client.execute(`Create file ${sourceFiles[i]} with content "File ${i + 1} content"`);
      }

      const result = await client.executeAndVerify(
        `Process all test*.txt files: read their contents, count total characters, and create a summary in ${summaryFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const summary = await readFileSafe(summaryFile);
      expect(summary).toBeDefined();
      expect(summary).toMatch(/\d+/); // Should contain counts
      expect(summary).not.toMatch(/\{\{.*\}\}/); // Templates resolved
    });

    it('should perform file transformations using templates', async () => {
      const inputFile = 'input.txt';
      const outputFile = 'transformed-output.txt';
      filesToCleanup.push(inputFile, outputFile);

      // Create input file
      await client.execute(`Create file ${inputFile} with content "Original content for transformation"`);

      const result = await client.executeAndVerify(
        `Read ${inputFile}, transform its content by adding metadata (file size, modification info), and write to ${outputFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const originalContent = await readFileSafe(inputFile);
      const transformedContent = await readFileSafe(outputFile);
      
      expect(transformedContent).toBeDefined();
      expect(transformedContent).toContain(originalContent);
      expect(transformedContent.length).toBeGreaterThan(originalContent.length);
    });
  });

  describe('Search and Analysis Workflows', () => {
    it('should perform multi-stage search and analysis', async () => {
      const analysisFile = 'search-analysis.json';
      filesToCleanup.push(analysisFile);

      const result = await client.executeAndVerify(
        `Search for all JavaScript files, then search for "function" keywords in those files, analyze the results, and save structured analysis to ${analysisFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(analysisFile);
      expect(content).toBeDefined();
      
      // Should be valid JSON or structured content
      expect(content.length).toBeGreaterThan(10);
      expect(content).not.toMatch(/\{\{.*\}\}/);
    });

    it('should create cross-references between search results', async () => {
      const crossRefFile = 'cross-references.txt';
      filesToCleanup.push(crossRefFile);

      const result = await client.executeAndVerify(
        `Find all .mjs files, search for imports in those files, and create a cross-reference document in ${crossRefFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(crossRefFile);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe('Todo Management Workflows', () => {
    it('should manage complex todo workflows', async () => {
      const todoReportFile = 'todo-report.md';
      filesToCleanup.push(todoReportFile);

      const result = await client.executeAndVerify(
        `Read current todos, add a new todo for "Review test results", update an existing todo to completed, and generate a todo status report in ${todoReportFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const report = await readFileSafe(todoReportFile);
      expect(report).toBeDefined();
      expect(report).toContain('todo'); // Should mention todos
    });

    it('should integrate todo management with project analysis', async () => {
      const integratedReportFile = 'integrated-todo-analysis.md';
      filesToCleanup.push(integratedReportFile);

      const result = await client.executeAndVerify(
        `Analyze the current project structure, identify potential improvement areas, create todos for those improvements, and generate an integrated report in ${integratedReportFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(integratedReportFile);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(100);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial workflow failures gracefully', async () => {
      const partialResultFile = 'partial-results.txt';
      filesToCleanup.push(partialResultFile);

      // Include an operation that might fail but shouldn't break the entire workflow
      const result = await client.execute(
        `List files, try to read a non-existent file, then create a summary in ${partialResultFile} with available information`
      );

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Some operations should succeed even if others fail
      const successfulOps = result.response.tool_results.filter(r => r.result && !r.error);
      expect(successfulOps.length).toBeGreaterThan(0);
    });

    it('should continue workflow execution despite template resolution errors', async () => {
      const result = await client.execute(
        'Create a workflow that references non-existent template variables but still performs useful work'
      );

      expect(result.response).toBeDefined();
      expect(result.response.tools || result.response.tool_results).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle workflows with many tools efficiently', async () => {
      const startTime = Date.now();
      
      const result = await client.executeAndVerify(
        'Create a workflow with multiple file operations: create 3 test files, read them all, search through them, and generate a final report'
      );
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(result.allSucceeded).toBe(true);
      expect(executionTime).toBeLessThan(60000); // Should complete within 60 seconds
      expect(result.toolResults.length).toBeGreaterThanOrEqual(3);
    });

    it('should maintain template context across many operations', async () => {
      const finalResultFile = 'context-test.txt';
      filesToCleanup.push(finalResultFile);

      const result = await client.executeAndVerify(
        `Perform a sequence of operations: list files, count them, search for patterns, analyze results, and create a final summary in ${finalResultFile} that references data from all previous steps`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(finalResultFile);
      expect(content).toBeDefined();
      expect(content).toMatch(/\d+/); // Should contain numerical data
      expect(content.length).toBeGreaterThan(50);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle a complete code review workflow', async () => {
      const reviewFile = 'code-review.md';
      filesToCleanup.push(reviewFile);

      const result = await client.executeAndVerify(
        `Perform a code review workflow: analyze all JavaScript files, check for common patterns, identify potential issues, and generate a review report in ${reviewFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const review = await readFileSafe(reviewFile);
      expect(review).toBeDefined();
      expect(review).toContain('#'); // Markdown formatting
      expect(review.length).toBeGreaterThan(200);
    });

    it('should handle project setup and configuration workflow', async () => {
      const configFile = 'project-config.json';
      const readmeFile = 'AUTO-README.md';
      filesToCleanup.push(configFile, readmeFile);

      const result = await client.executeAndVerify(
        `Create a project setup workflow: analyze existing configuration, create optimized config in ${configFile}, and generate documentation in ${readmeFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const config = await readFileSafe(configFile);
      const readme = await readFileSafe(readmeFile);
      
      expect(config).toBeDefined();
      expect(readme).toBeDefined();
      expect(readme).toContain('#'); // Should have headers
    });
  });
});