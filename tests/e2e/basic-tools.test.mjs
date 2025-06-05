import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AIMasterClient from '../utils/aimaster-client.mjs';
import { 
  cleanupFiles, 
  fileExists, 
  readFileSafe, 
  createTempDir, 
  cleanupTempDir,
  getOutputPath,
  ensureOutputDirs 
} from '../utils/test-helpers.mjs';
import { commonTestFiles } from '../utils/output-paths.mjs';

describe('Basic Tool Execution', () => {
  let client;
  let tempDir;
  let filesToCleanup = [];

  beforeEach(async () => {
    await ensureOutputDirs();
    client = new AIMasterClient();
    tempDir = await createTempDir('basic-tools');
    filesToCleanup = [];
  });

  afterEach(async () => {
    await cleanupFiles(filesToCleanup);
    await cleanupTempDir(tempDir);
  });

  describe('File Operations', () => {
    it('should create a file with write_file tool', async () => {
      const testFile = commonTestFiles.writeTest();
      filesToCleanup.push(testFile);

      const result = await client.executeAndVerify(
        `Create a file called ${testFile} with content "Hello World"`
      );

      expect(result.allSucceeded).toBe(true);
      expect(result.successCount).toBe(1);
      
      const content = await readFileSafe(testFile);
      expect(content).toBe('Hello World');
    });

    it('should read an existing file with read_file tool', async () => {
      const testFile = 'test-read.txt';
      filesToCleanup.push(testFile);
      
      // Create test file first
      await client.execute(`Write "Test content" to file ${testFile}`);
      
      const result = await client.executeAndVerify(
        `Read the contents of ${testFile}`
      );

      expect(result.allSucceeded).toBe(true);
      expect(result.response.tool_results[0].result.content).toBe('Test content');
    });

    it('should list directory contents with list_directory tool', async () => {
      const result = await client.executeAndVerify('List the current directory');

      expect(result.allSucceeded).toBe(true);
      expect(result.response.tool_results[0].result.entries).toBeInstanceOf(Array);
      expect(result.response.tool_results[0].result.count).toBeGreaterThan(0);
    });

    it('should copy files with copy_files tool', async () => {
      const sourceFile = 'source.txt';
      const targetFile = 'target.txt';
      filesToCleanup.push(sourceFile, targetFile);

      // Create source file
      await client.execute(`Write "Source content" to file ${sourceFile}`);
      
      const result = await client.executeAndVerify(
        `Copy ${sourceFile} to ${targetFile}`
      );

      expect(result.allSucceeded).toBe(true);
      
      const sourceContent = await readFileSafe(sourceFile);
      const targetContent = await readFileSafe(targetFile);
      expect(sourceContent).toBe(targetContent);
      expect(targetContent).toBe('Source content');
    });
  });

  describe('Shell Commands', () => {
    it('should execute shell commands with execute_shell_command tool', async () => {
      const result = await client.executeAndVerify('Execute shell command: echo "Hello from shell"');

      expect(result.allSucceeded).toBe(true);
      expect(result.response.tool_results[0].result.stdout).toBe('Hello from shell');
      expect(result.response.tool_results[0].result.stderr).toBe('');
      expect(result.response.tool_results[0].result.exitCode).toBe(0);
    });

    it('should handle shell command errors gracefully', async () => {
      const result = await client.execute('Execute shell command: nonexistent-command-xyz');
      
      expect(result.response.tool_results).toBeInstanceOf(Array);
      expect(result.response.tool_results.length).toBeGreaterThan(0);
      
      const toolResult = result.response.tool_results[0];
      expect(toolResult.error || (toolResult.result && toolResult.result.stderr)).toBeDefined();
    });
  });

  describe('Search Operations', () => {
    it('should search for files with search_files tool', async () => {
      const result = await client.executeAndVerify('Search for all .mjs files in current directory');

      expect(result.allSucceeded).toBe(true);
      const searchResult = result.response.tool_results[0].result;
      expect(searchResult.results).toBeInstanceOf(Array);
      expect(searchResult.count).toBeGreaterThan(0);
      
      // Should find agent.mjs
      const agentFile = searchResult.results.find(file => file.name === 'agent.mjs');
      expect(agentFile).toBeDefined();
    });

    it('should search file contents with ripgrep_search tool', async () => {
      const result = await client.executeAndVerify('Search for "function" in JavaScript files');

      expect(result.allSucceeded).toBe(true);
      const searchResult = result.response.tool_results[0].result;
      expect(searchResult.matches).toBeInstanceOf(Array);
      expect(searchResult.totalMatches || searchResult.matches.length).toBeGreaterThan(0);
      expect(searchResult.filesWithMatches || searchResult.fileMatches).toBeDefined();
    });
  });

  describe('Todo System', () => {
    it('should read current todos with todo_read tool', async () => {
      const result = await client.executeAndVerify('Read the current todo list');

      expect(result.allSucceeded).toBe(true);
      const todoResult = result.response.tool_results[0].result;
      expect(todoResult.todos).toBeInstanceOf(Array);
      expect(typeof todoResult.count).toBe('number');
    });

    it('should write todos with todo_write tool', async () => {
      const result = await client.executeAndVerify('Add a todo: "Test todo item" with high priority');

      expect(result.allSucceeded).toBe(true);
      const todoResult = result.response.tool_results[0].result;
      expect(todoResult.todos).toBeInstanceOf(Array);
      expect(todoResult.count).toBeGreaterThan(0);
      
      // Verify the todo was added
      const addedTodo = todoResult.todos.find(todo => todo.content === 'Test todo item');
      expect(addedTodo).toBeDefined();
      expect(addedTodo.priority).toBe('high');
      expect(addedTodo.status).toBe('pending');
    });
  });

  describe('Response Format', () => {
    it('should return valid JSON response structure', async () => {
      const result = await client.execute('List current directory');

      expect(result.response).toBeDefined();
      expect(typeof result.response.thoughts).toBe('string');
      expect(typeof result.response.content).toBe('string');
      expect(result.response.tools).toBeInstanceOf(Array);
      expect(result.response.tool_results).toBeInstanceOf(Array);
    });

    it('should include tool execution results', async () => {
      const result = await client.execute('Create file test-response.txt with content "test"');
      filesToCleanup.push('test-response.txt');

      expect(result.response.tool_results).toBeInstanceOf(Array);
      expect(result.response.tool_results.length).toBeGreaterThan(0);
      
      const toolResult = result.response.tool_results[0];
      expect(toolResult.id).toBeDefined();
      expect(toolResult.result || toolResult.error).toBeDefined();
    });
  });
});