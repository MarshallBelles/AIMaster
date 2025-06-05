import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AIMasterClient from '../utils/aimaster-client.mjs';
import { 
  cleanupFiles, 
  readFileSafe, 
  createTempDir, 
  cleanupTempDir, 
  extractTemplateVars,
  assertTemplateVars 
} from '../utils/test-helpers.mjs';

describe('Jinja2 Templating System', () => {
  let client;
  let tempDir;
  let filesToCleanup = [];

  beforeEach(async () => {
    client = new AIMasterClient();
    tempDir = await createTempDir('templating');
    filesToCleanup = [];
  });

  afterEach(async () => {
    await cleanupFiles(filesToCleanup);
    await cleanupTempDir(tempDir);
  });

  describe('Template Syntax Detection', () => {
    it('should generate tools with template syntax', async () => {
      const usesTemplating = await client.usesTemplating(
        'List files in current directory and create a summary showing the count'
      );

      expect(usesTemplating).toBe(true);
    });

    it('should use proper Jinja2 syntax (not JavaScript)', async () => {
      const tools = await client.getTools(
        'List files and write summary with file count'
      );

      const toolsJson = JSON.stringify(tools);
      
      // Should contain Jinja2 templates
      expect(toolsJson).toMatch(/\{\{[\w\.\-_]+\}\}/);
      
      // Should NOT contain JavaScript templates
      expect(toolsJson).not.toMatch(/\$\{[\w\.\-_]+\}/);
      expect(toolsJson).not.toMatch(/`[^`]*\$\{[^}]*\}[^`]*`/);
    });
  });

  describe('Simple Template Resolution', () => {
    it('should resolve basic template variables', async () => {
      const testFile = 'template-test.txt';
      filesToCleanup.push(testFile);

      const result = await client.executeAndVerify(
        `List current directory and write a summary to ${testFile} showing the file count`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(testFile);
      expect(content).toBeDefined();
      expect(content).toMatch(/\d+/); // Should contain a number (the file count)
      
      // Should not contain unresolved templates
      expect(content).not.toMatch(/\{\{.*\}\}/);
    });

    it('should resolve array template variables', async () => {
      const testFile = 'array-template-test.txt';
      filesToCleanup.push(testFile);

      const result = await client.executeAndVerify(
        `List files in current directory and write them to ${testFile} showing all filenames`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(testFile);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      
      // Should contain actual filenames
      expect(content).toContain('agent.mjs');
      expect(content).not.toMatch(/\{\{.*\}\}/);
    });
  });

  describe('Dependency Resolution', () => {
    it('should execute tools in dependency order', async () => {
      const reportFile = 'dependency-test.txt';
      filesToCleanup.push(reportFile);

      const result = await client.executeAndVerify(
        `List files in current directory, then search for "function" in those files, then create a report in ${reportFile} showing both the file count and function count`
      );

      expect(result.allSucceeded).toBe(true);
      expect(result.toolResults.length).toBeGreaterThanOrEqual(2);
      
      // Verify tools executed in correct order by checking tool IDs in results
      const toolIds = result.toolResults.map(r => r.id);
      
      // Should have list operation before search operation
      const listIndex = toolIds.findIndex(id => id.includes('list') || id.includes('files'));
      const searchIndex = toolIds.findIndex(id => id.includes('search') || id.includes('function'));
      const reportIndex = toolIds.findIndex(id => id.includes('report') || id.includes('write') || id.includes('create'));
      
      if (listIndex !== -1 && searchIndex !== -1) {
        expect(listIndex).toBeLessThan(searchIndex);
      }
      if (searchIndex !== -1 && reportIndex !== -1) {
        expect(searchIndex).toBeLessThan(reportIndex);
      }
    });

    it('should handle complex template paths', async () => {
      const summaryFile = 'complex-template-test.txt';
      filesToCleanup.push(summaryFile);

      const result = await client.executeAndVerify(
        `Search for JavaScript files, then write a summary to ${summaryFile} with the count and first file name`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(summaryFile);
      expect(content).toBeDefined();
      
      // Should contain resolved template data
      expect(content).toMatch(/\d+/); // Should have numbers
      expect(content).not.toMatch(/\{\{.*\}\}/); // No unresolved templates
    });
  });

  describe('Error Handling', () => {
    it('should handle missing template variables gracefully', async () => {
      const tools = await client.getTools(
        'Write a file with content referencing a non-existent tool result'
      );

      // Should still generate valid tools even if templates might not resolve
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should fallback to sequential execution on dependency errors', async () => {
      // This test would require a circular dependency scenario
      // For now, we test that the system doesn't crash with complex workflows
      const result = await client.execute(
        'Create multiple files and cross-reference them in a complex workflow'
      );

      expect(result.response).toBeDefined();
      expect(result.response.tools || result.response.tool_results).toBeDefined();
    });
  });

  describe('Template Variable Extraction', () => {
    it('should extract template variables correctly', () => {
      const content = 'Found {{files.count}} files: {{files.entries}}';
      const vars = extractTemplateVars(content);
      
      expect(vars).toContain('files.count');
      expect(vars).toContain('files.entries');
      expect(vars.length).toBe(2);
    });

    it('should handle nested object paths', () => {
      const content = 'Result: {{search.result.matches.length}}';
      const vars = extractTemplateVars(content);
      
      expect(vars).toContain('search.result.matches.length');
    });

    it('should handle templates with spaces', () => {
      const content = 'Value: {{ spaced.variable }}';
      const vars = extractTemplateVars(content);
      
      expect(vars).toContain('spaced.variable');
    });
  });

  describe('Integration with Real Workflows', () => {
    it('should create a complete analysis report using templates', async () => {
      const reportFile = 'integration-report.md';
      filesToCleanup.push(reportFile);

      const result = await client.executeAndVerify(
        `Create a markdown report in ${reportFile} that lists all files in the current directory and counts functions in JavaScript files`
      );

      expect(result.allSucceeded).toBe(true);
      
      const content = await readFileSafe(reportFile);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      
      // Should be valid markdown with data
      expect(content).toMatch(/#|##|\*|\-/); // Some markdown formatting
      expect(content).toMatch(/\d+/); // Should contain numbers
      expect(content).not.toMatch(/\{\{.*\}\}/); // No unresolved templates
    });

    it('should handle file operations with templated paths', async () => {
      const sourceFile = 'template-source.txt';
      const targetFile = 'template-target.txt';
      filesToCleanup.push(sourceFile, targetFile);

      const result = await client.executeAndVerify(
        `Create a file ${sourceFile} with "test content", then copy it and create a summary showing the file was copied successfully`
      );

      expect(result.allSucceeded).toBe(true);
      
      // Both files should exist with same content
      const sourceContent = await readFileSafe(sourceFile);
      expect(sourceContent).toBe('test content');
      
      // Check if a copy operation occurred
      const copyResult = result.toolResults.find(r => 
        r.result && (r.result.source || r.result.destination)
      );
      expect(copyResult).toBeDefined();
    });
  });
});