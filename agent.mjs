import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';
import { chromium } from 'playwright';

const execAsync = promisify(exec);

// Configure nunjucks environment for template processing
const templateEnv = nunjucks.configure({ autoescape: false });

/**
 * Template processing system for tool chaining
 */
class TemplateProcessor {
  /**
   * Extract template variables from a string or object
   * @param {any} input - String or object that may contain {{variable}} references  
   * @returns {Set<string>} Set of variable names found
   */
  static extractVariables(input) {
    const variables = new Set();
    const templateRegex = /\{\{\s*([^}]+)\s*\}\}/g;
    
    const processValue = (value) => {
      if (typeof value === 'string') {
        let match;
        while ((match = templateRegex.exec(value)) !== null) {
          variables.add(match[1].trim());
        }
      } else if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(processValue);
      }
    };
    
    processValue(input);
    return variables;
  }
  
  /**
   * Build dependency graph for tool execution order
   * @param {ToolCall[]} tools - Array of tool calls
   * @returns {Object} Dependency graph and execution order
   */
  static buildDependencyGraph(tools) {
    const dependencies = new Map();
    const toolIds = new Set(tools.map(tool => tool.id));
    
    // Extract dependencies for each tool
    tools.forEach(tool => {
      const variables = this.extractVariables(tool.function?.arguments || {});
      const deps = Array.from(variables).filter(variable => {
        const toolId = variable.split('.')[0];
        return toolIds.has(toolId);
      });
      dependencies.set(tool.id, deps);
    });
    
    // Topological sort to determine execution order
    const visited = new Set();
    const temp = new Set();
    const order = [];
    
    const visit = (toolId) => {
      if (temp.has(toolId)) {
        throw new Error(`Circular dependency detected involving tool: ${toolId}`);
      }
      if (!visited.has(toolId)) {
        temp.add(toolId);
        const deps = dependencies.get(toolId) || [];
        deps.forEach(dep => {
          const depToolId = dep.split('.')[0];
          if (toolIds.has(depToolId)) {
            visit(depToolId);
          }
        });
        temp.delete(toolId);
        visited.add(toolId);
        order.push(toolId);
      }
    };
    
    tools.forEach(tool => visit(tool.id));
    
    return { dependencies, order };
  }
  
  /**
   * Process template variables in tool arguments
   * @param {Object} args - Tool arguments that may contain templates
   * @param {Object} context - Available variables for substitution  
   * @returns {Object} Processed arguments with templates resolved
   */
  static processArguments(args, context) {
    if (!args || typeof args !== 'object') {
      return args;
    }
    
    const processValue = (value) => {
      if (typeof value === 'string') {
        // Check if it's a pure template reference (entire string is one template)
        const pureTemplateMatch = value.match(/^\{\{\s*([^}]+)\s*\}\}$/);
        if (pureTemplateMatch) {
          const varPath = pureTemplateMatch[1].trim();
          const result = this.resolveVariable(varPath, context);
          return result !== undefined ? result : value;
        }
        
        // Process inline templates within strings
        return templateEnv.renderString(value, context);
      } else if (Array.isArray(value)) {
        return value.map(processValue);
      } else if (typeof value === 'object' && value !== null) {
        const processed = {};
        Object.entries(value).forEach(([key, val]) => {
          processed[key] = processValue(val);
        });
        return processed;
      }
      return value;
    };
    
    return processValue(args);
  }
  
  /**
   * Resolve a variable path like "tool_id.result.field" from context
   * @param {string} varPath - Variable path to resolve
   * @param {Object} context - Context object containing tool results
   * @returns {any} Resolved value or undefined
   */
  static resolveVariable(varPath, context) {
    const parts = varPath.split('.');
    let current = context;
    
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
}

/**
 * @typedef {Object} ToolCall
 * @property {string} id - Unique identifier for the tool call
 * @property {string} type - Type of tool call (e.g., "function")
 * @property {ToolFunction} function - Function details
 */

/**
 * @typedef {Object} ToolFunction
 * @property {string} name - Name of the function to call
 * @property {Object} arguments - JSON object containing function arguments
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} type - Tool type (e.g., "function")
 * @property {FunctionDefinition} function - Function definition
 */

/**
 * @typedef {Object} FunctionDefinition
 * @property {string} name - Function name
 * @property {string} description - Function description
 * @property {Object} parameters - JSON schema for function parameters
 */

/**
 * @typedef {Object} AgentResponse
 * @property {string} content - The main response content
 * @property {ToolCall[]} [tools] - Array of tool calls to execute
 * @property {string} [reasoning] - Optional reasoning for the response
 * @property {string} [thoughts] - Optional internal thoughts for thinking models
 */

/**
 * @typedef {Object} Config
 * @property {string} apiUrl - Base URL for the LLM API
 * @property {string} model - Model name to use
 * @property {string} logLevel - Logging level (debug, info, warn, error)
 * @property {number} maxTokens - Maximum tokens in response
 * @property {number} temperature - Temperature for generation
 */

const DEFAULT_CONFIG = {
  apiUrl: 'http://Arbiter2:8080',
  model: 'qwen-2-5-coder',
  logLevel: 'info',
  maxTokens: 2048,
  temperature: 0.7
};

const SYSTEM_PROMPT = `You are AIMaster (AIM). RESPOND WITH RAW JSON ONLY - NO MARKDOWN, NO CODE BLOCKS.

FORMAT: {"thoughts": "reasoning", "content": "response", "tools": [optional]}

TOOLS:
- execute_shell_command: {"command": "shell command"}
- read_file: {"file_path": "path"}
- write_file: {"file_path": "path", "content": "text"}
- append_to_file: {"file_path": "path", "content": "text"}
- list_directory: {"directory_path": "path", "detailed": false}
- create_directory: {"directory_path": "path", "recursive": true}
- copy_files: {"source": "path", "destination": "path"}
- move_files: {"source": "path", "destination": "path"}
- delete_file: {"file_path": "path"}
- get_file_info: {"file_path": "path"}
- search_files: {"search_path": "path", "pattern": "*.js", "recursive": true}
- find_and_replace: {"search_path": "path", "search_text": "old", "replace_text": "new", "file_pattern": "*.js", "recursive": true}
- ripgrep_search: {"pattern": "regex", "search_path": "path", "options": {"fileType": "js"}}
- todo_read: {}
- todo_write: {"todos": [{"content": "task", "status": "pending", "priority": "high"}]}
- browser_navigate: {"url": "https://example.com", "waitFor": "networkidle", "screenshot": false, "extractData": {"title": "h1", "links": "a[href]"}}
- browser_interact: {"actions": [{"type": "click", "selector": ".button"}, {"type": "type", "selector": "input", "text": "query"}, {"type": "wait", "selector": ".results"}]}
- http_fetch: {"url": "https://api.example.com", "method": "GET", "headers": {"Authorization": "Bearer token"}, "data": {}}

TOOL CHAINING: Use {{tool_id.field}} to reference previous tool results.
Example: {"id": "t1", "function": {"name": "list_directory", "arguments": {"directory_path": "./src"}}}, {"id": "t2", "function": {"name": "write_file", "arguments": {"file_path": "./report.txt", "content": "Found {{t1.count}} files"}}}

Be proactive, explore with tools, and maintain JSON format.`;

/**
 * Logger utility with JSON output and timestamps
 */
class Logger {
  constructor(level = 'info', jsonMode = false) {
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.level = this.levels[level] || 1;
    this.jsonMode = jsonMode;
  }

  _log(level, message, data = {}) {
    if (this.levels[level] < this.level) return;
    
    if (this.jsonMode) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        message,
        data,
        source: 'aimaster'
      };
      console.error(JSON.stringify(logEntry)); // Use stderr for logs to keep stdout clean
    } else {
      const color = {
        debug: chalk.gray,
        info: chalk.blue,
        warn: chalk.yellow,
        error: chalk.red
      }[level] || chalk.white;
      
      console.error(color(`[${level.toUpperCase()}] ${message}`));
      if (Object.keys(data).length > 0) {
        console.error(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  }

  debug(message, data = {}) {
    this._log('debug', message, data);
  }

  info(message, data = {}) {
    this._log('info', message, data);
  }

  warn(message, data = {}) {
    this._log('warn', message, data);
  }

  error(message, data = {}) {
    this._log('error', message, data);
  }
}

/**
 * Get configuration from environment variables and command line arguments
 * @returns {Config} Configuration object
 */
function getConfig() {
  const config = { ...DEFAULT_CONFIG };
  
  // Environment variables
  if (process.env.AIM_API_URL) config.apiUrl = process.env.AIM_API_URL;
  if (process.env.AIM_MODEL) config.model = process.env.AIM_MODEL;
  if (process.env.AIM_LOG_LEVEL) config.logLevel = process.env.AIM_LOG_LEVEL;
  if (process.env.AIM_MAX_TOKENS) config.maxTokens = parseInt(process.env.AIM_MAX_TOKENS);
  if (process.env.AIM_TEMPERATURE) config.temperature = parseFloat(process.env.AIM_TEMPERATURE);
  
  // Command line arguments
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--api-url':
        config.apiUrl = args[++i];
        break;
      case '--model':
        config.model = args[++i];
        break;
      case '--log-level':
        config.logLevel = args[++i];
        break;
      case '--max-tokens':
        config.maxTokens = parseInt(args[++i]);
        break;
      case '--temperature':
        config.temperature = parseFloat(args[++i]);
        break;
    }
  }
  
  return config;
}

/**
 * Execute a shell command safely
 * @param {string} command - The shell command to execute
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{stdout: string, stderr: string, success: boolean}>} Command result
 */
async function executeShellCommand(command, logger) {
  try {
    logger.debug('Executing shell command:', command);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    logger.debug('Command output:', { stdout: stdout.substring(0, 500), stderr });
    
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      success: true
    };
  } catch (error) {
    logger.error('Shell command failed:', error.message);
    
    return {
      stdout: '',
      stderr: error.message,
      success: false
    };
  }
}

/**
 * Read content from a file (cross-platform)
 * @param {string} filePath - Path to the file to read
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function readFile(filePath, logger) {
  try {
    logger.debug('Reading file:', filePath);
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf8');
    
    return {
      content,
      path: absolutePath,
      success: true
    };
  } catch (error) {
    logger.error('Failed to read file:', error.message);
    return {
      content: '',
      path: filePath,
      error: error.message,
      success: false
    };
  }
}

/**
 * Write content to a file (cross-platform)
 * @param {string} filePath - Path to the file to write
 * @param {string} content - Content to write
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function writeFile(filePath, content, logger) {
  try {
    logger.debug('Writing file:', filePath);
    const absolutePath = path.resolve(filePath);
    
    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(absolutePath, content, 'utf8');
    
    return {
      path: absolutePath,
      bytesWritten: Buffer.byteLength(content, 'utf8'),
      success: true
    };
  } catch (error) {
    logger.error('Failed to write file:', error.message);
    return {
      path: filePath,
      error: error.message,
      success: false
    };
  }
}

/**
 * Append content to a file (cross-platform)
 * @param {string} filePath - Path to the file to append to
 * @param {string} content - Content to append
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function appendToFile(filePath, content, logger) {
  try {
    logger.debug('Appending to file:', filePath);
    const absolutePath = path.resolve(filePath);
    
    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.appendFile(absolutePath, content, 'utf8');
    
    return {
      path: absolutePath,
      bytesAppended: Buffer.byteLength(content, 'utf8'),
      success: true
    };
  } catch (error) {
    logger.error('Failed to append to file:', error.message);
    return {
      path: filePath,
      error: error.message,
      success: false
    };
  }
}

/**
 * List directory contents (cross-platform)
 * @param {string} dirPath - Path to the directory to list
 * @param {boolean} detailed - Whether to include file details
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function listDirectory(dirPath, detailed = false, logger) {
  try {
    logger.debug('Listing directory:', dirPath);
    const absolutePath = path.resolve(dirPath);
    const entries = await fs.readdir(absolutePath);
    
    if (!detailed) {
      return {
        path: absolutePath,
        entries,
        count: entries.length,
        success: true
      };
    }
    
    // Get detailed info for each entry
    const detailedEntries = [];
    for (const entry of entries) {
      try {
        const entryPath = path.join(absolutePath, entry);
        const stats = await fs.stat(entryPath);
        detailedEntries.push({
          name: entry,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8)
        });
      } catch (entryError) {
        detailedEntries.push({
          name: entry,
          error: entryError.message
        });
      }
    }
    
    return {
      path: absolutePath,
      entries: detailedEntries,
      count: detailedEntries.length,
      success: true
    };
  } catch (error) {
    logger.error('Failed to list directory:', error.message);
    return {
      path: dirPath,
      entries: [],
      error: error.message,
      success: false
    };
  }
}

/**
 * Create a directory (cross-platform)
 * @param {string} dirPath - Path to the directory to create
 * @param {boolean} recursive - Whether to create parent directories
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function createDirectory(dirPath, recursive = true, logger) {
  try {
    logger.debug('Creating directory:', dirPath);
    const absolutePath = path.resolve(dirPath);
    await fs.mkdir(absolutePath, { recursive });
    
    return {
      path: absolutePath,
      success: true
    };
  } catch (error) {
    logger.error('Failed to create directory:', error.message);
    return {
      path: dirPath,
      error: error.message,
      success: false
    };
  }
}

/**
 * Copy files or directories (cross-platform)
 * @param {string} source - Source path
 * @param {string} destination - Destination path
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function copyFiles(source, destination, logger) {
  try {
    logger.debug('Copying:', source, 'to', destination);
    const sourcePath = path.resolve(source);
    const destPath = path.resolve(destination);
    
    // Check if source exists
    const sourceStats = await fs.stat(sourcePath);
    
    if (sourceStats.isDirectory()) {
      // Copy directory recursively
      await copyDirectoryRecursive(sourcePath, destPath);
    } else {
      // Ensure destination directory exists
      const destDir = path.dirname(destPath);
      await fs.mkdir(destDir, { recursive: true });
      
      // Copy file
      await fs.copyFile(sourcePath, destPath);
    }
    
    return {
      source: sourcePath,
      destination: destPath,
      success: true
    };
  } catch (error) {
    logger.error('Failed to copy:', error.message);
    return {
      source,
      destination,
      error: error.message,
      success: false
    };
  }
}

/**
 * Helper function to copy directory recursively
 * @param {string} source - Source directory path
 * @param {string} destination - Destination directory path
 */
async function copyDirectoryRecursive(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source);
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry);
    const destPath = path.join(destination, entry);
    const stats = await fs.stat(sourcePath);
    
    if (stats.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, destPath);
    } else {
      await fs.copyFile(sourcePath, destPath);
    }
  }
}

/**
 * Move/rename files or directories (cross-platform)
 * @param {string} source - Source path
 * @param {string} destination - Destination path
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function moveFiles(source, destination, logger) {
  try {
    logger.debug('Moving:', source, 'to', destination);
    const sourcePath = path.resolve(source);
    const destPath = path.resolve(destination);
    
    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });
    
    await fs.rename(sourcePath, destPath);
    
    return {
      source: sourcePath,
      destination: destPath,
      success: true
    };
  } catch (error) {
    logger.error('Failed to move:', error.message);
    return {
      source,
      destination,
      error: error.message,
      success: false
    };
  }
}

/**
 * Delete a file (cross-platform)
 * @param {string} filePath - Path to the file to delete
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function deleteFile(filePath, logger) {
  try {
    logger.debug('Deleting file:', filePath);
    const absolutePath = path.resolve(filePath);
    await fs.unlink(absolutePath);
    
    return {
      path: absolutePath,
      success: true
    };
  } catch (error) {
    logger.error('Failed to delete file:', error.message);
    return {
      path: filePath,
      error: error.message,
      success: false
    };
  }
}

/**
 * Get file information (cross-platform)
 * @param {string} filePath - Path to the file
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function getFileInfo(filePath, logger) {
  try {
    logger.debug('Getting file info:', filePath);
    const absolutePath = path.resolve(filePath);
    const stats = await fs.stat(absolutePath);
    
    return {
      path: absolutePath,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8),
      success: true
    };
  } catch (error) {
    logger.error('Failed to get file info:', error.message);
    return {
      path: filePath,
      error: error.message,
      success: false
    };
  }
}

/**
 * Search for files by name pattern (cross-platform)
 * @param {string} searchPath - Directory to search in
 * @param {string} pattern - File name pattern (supports * and ?)
 * @param {boolean} recursive - Whether to search recursively
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function searchFiles(searchPath, pattern, recursive = true, logger) {
  try {
    logger.debug('Searching files:', { searchPath, pattern, recursive });
    const absolutePath = path.resolve(searchPath);
    const results = [];
    
    await searchFilesRecursive(absolutePath, pattern, recursive, results);
    
    return {
      searchPath: absolutePath,
      pattern,
      results,
      count: results.length,
      success: true
    };
  } catch (error) {
    logger.error('Failed to search files:', error.message);
    return {
      searchPath,
      pattern,
      results: [],
      error: error.message,
      success: false
    };
  }
}

/**
 * Helper function for recursive file search
 * @param {string} dir - Directory to search
 * @param {string} pattern - Pattern to match
 * @param {boolean} recursive - Whether to recurse
 * @param {Array} results - Results array
 */
async function searchFilesRecursive(dir, pattern, recursive, results) {
  try {
    const entries = await fs.readdir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory() && recursive) {
        await searchFilesRecursive(fullPath, pattern, recursive, results);
      } else if (stats.isFile()) {
        if (matchesPattern(entry, pattern)) {
          results.push({
            name: entry,
            path: fullPath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          });
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }
}

/**
 * Simple pattern matching for file names (supports * and ?)
 * @param {string} filename - File name to test
 * @param {string} pattern - Pattern to match against
 * @returns {boolean} Whether the filename matches the pattern
 */
function matchesPattern(filename, pattern) {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

/**
 * Find and replace text in files (cross-platform)
 * @param {string} searchPath - Directory to search in
 * @param {string} searchText - Text to search for
 * @param {string} replaceText - Text to replace with
 * @param {string} filePattern - File pattern to include (e.g., "*.js")
 * @param {boolean} recursive - Whether to search recursively
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function findAndReplace(searchPath, searchText, replaceText, filePattern = '*', recursive = true, logger) {
  try {
    logger.debug('Find and replace:', { searchPath, searchText, replaceText, filePattern, recursive });
    const absolutePath = path.resolve(searchPath);
    const results = [];
    
    await findAndReplaceRecursive(absolutePath, searchText, replaceText, filePattern, recursive, results);
    
    return {
      searchPath: absolutePath,
      searchText,
      replaceText,
      filePattern,
      results,
      filesModified: results.filter(r => r.replacements > 0).length,
      totalReplacements: results.reduce((sum, r) => sum + r.replacements, 0),
      success: true
    };
  } catch (error) {
    logger.error('Failed to find and replace:', error.message);
    return {
      searchPath,
      searchText,
      replaceText,
      results: [],
      error: error.message,
      success: false
    };
  }
}

/**
 * Helper function for recursive find and replace
 * @param {string} dir - Directory to search
 * @param {string} searchText - Text to search for
 * @param {string} replaceText - Text to replace with
 * @param {string} filePattern - File pattern to include
 * @param {boolean} recursive - Whether to recurse
 * @param {Array} results - Results array
 */
async function findAndReplaceRecursive(dir, searchText, replaceText, filePattern, recursive, results) {
  try {
    const entries = await fs.readdir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory() && recursive) {
        await findAndReplaceRecursive(fullPath, searchText, replaceText, filePattern, recursive, results);
      } else if (stats.isFile() && matchesPattern(entry, filePattern)) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          const originalContent = content;
          const newContent = content.replace(new RegExp(searchText, 'g'), replaceText);
          const replacements = (originalContent.match(new RegExp(searchText, 'g')) || []).length;
          
          if (replacements > 0) {
            await fs.writeFile(fullPath, newContent, 'utf8');
          }
          
          results.push({
            path: fullPath,
            replacements,
            modified: replacements > 0
          });
        } catch (fileError) {
          results.push({
            path: fullPath,
            error: fileError.message,
            replacements: 0,
            modified: false
          });
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }
}

/**
 * Search code using ripgrep with advanced options (requires rg command)
 * @param {string} pattern - Regex pattern to search for
 * @param {string} searchPath - Directory to search in
 * @param {Object} options - Search options
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function ripgrepSearch(pattern, searchPath = '.', options = {}, logger) {
  try {
    const {
      fileType = null,          // e.g., 'js', 'ts', 'py'
      ignoreCase = false,       // Case insensitive search
      wholeWord = false,        // Match whole words only
      contextLines = 0,         // Lines of context around matches
      maxCount = null,          // Max matches per file
      includeHidden = false,    // Include hidden files
      followSymlinks = false,   // Follow symbolic links
      excludePattern = null,    // Exclude files matching pattern
      onlyFilenames = false,    // Only show filenames with matches
      invertMatch = false,      // Show lines that don't match
      multiline = false,        // Enable multiline matching
      fixedStrings = false      // Treat pattern as literal string
    } = options;

    logger.debug('Running ripgrep search', { pattern, searchPath, options });
    
    // Build ripgrep command
    const args = ['rg'];
    
    // Core pattern and options
    if (ignoreCase) args.push('-i');
    if (wholeWord) args.push('-w');
    if (onlyFilenames) args.push('-l');
    if (invertMatch) args.push('-v');
    if (multiline) args.push('-U');
    if (fixedStrings) args.push('-F');
    if (includeHidden) args.push('--hidden');
    if (followSymlinks) args.push('-L');
    
    // Context lines
    if (contextLines > 0) {
      args.push('-C', contextLines.toString());
    }
    
    // Max count per file
    if (maxCount) {
      args.push('-m', maxCount.toString());
    }
    
    // File type filtering
    if (fileType) {
      args.push('-t', fileType);
    }
    
    // Exclude pattern
    if (excludePattern) {
      args.push('-g', `!${excludePattern}`);
    }
    
    // Output format
    args.push('--color=never');  // No color for parsing
    args.push('--no-heading');   // No file headings
    args.push('--line-number');  // Include line numbers
    args.push('--column');       // Include column numbers
    
    // Pattern and search path (properly quoted)
    args.push(`"${pattern}"`);
    args.push(searchPath);
    
    const command = args.join(' ');
    logger.debug('Ripgrep command:', command);
    
    const { stdout } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024 // 5MB buffer for large results
    });
    
    // Parse ripgrep output
    const matches = [];
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        // Parse ripgrep output format: file:line:column:content
        const match = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, colNum, content] = match;
          matches.push({
            file: file,
            line: parseInt(lineNum, 10),
            column: parseInt(colNum, 10),
            content: content.trim(),
            match: line
          });
        }
      }
    }
    
    // Group matches by file for summary
    const fileMatches = {};
    for (const match of matches) {
      if (!fileMatches[match.file]) {
        fileMatches[match.file] = [];
      }
      fileMatches[match.file].push(match);
    }
    
    return {
      pattern,
      searchPath: path.resolve(searchPath),
      matches,
      fileMatches,
      totalMatches: matches.length,
      filesWithMatches: Object.keys(fileMatches).length,
      command,
      success: true
    };
    
  } catch (error) {
    logger.error('Ripgrep search failed:', error.message);
    
    // Check if ripgrep is available
    if (error.message.includes('rg') && (error.message.includes('not found') || error.message.includes('command not found'))) {
      return {
        pattern,
        searchPath,
        matches: [],
        error: 'ripgrep (rg) command not found. Please install ripgrep: https://github.com/BurntSushi/ripgrep',
        success: false
      };
    }
    
    return {
      pattern,
      searchPath,
      matches: [],
      error: error.message,
      success: false
    };
  }
}

/**
 * Read todos from the persistent todo file
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result with todos array
 */
async function todoRead(logger) {
  try {
    const todoFile = path.resolve('.aim-todos.json');
    logger.debug('Reading todos from:', todoFile);
    
    try {
      const content = await fs.readFile(todoFile, 'utf8');
      const todos = JSON.parse(content);
      
      return {
        todos: Array.isArray(todos) ? todos : [],
        count: Array.isArray(todos) ? todos.length : 0,
        file: todoFile,
        success: true
      };
    } catch (fileError) {
      // File doesn't exist or is invalid - return empty list
      if (fileError.code === 'ENOENT') {
        return {
          todos: [],
          count: 0,
          file: todoFile,
          success: true,
          message: 'No todo file found - starting fresh'
        };
      }
      throw fileError;
    }
  } catch (error) {
    logger.error('Failed to read todos:', error.message);
    return {
      todos: [],
      count: 0,
      error: error.message,
      success: false
    };
  }
}

/**
 * Write todos to the persistent todo file
 * @param {Array} todos - Array of todo objects
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function todoWrite(todos, logger) {
  try {
    const todoFile = path.resolve('.aim-todos.json');
    logger.debug('Writing todos to:', todoFile);
    
    // Validate todos array
    if (!Array.isArray(todos)) {
      throw new Error('Todos must be an array');
    }
    
    // Ensure each todo has required fields with defaults
    const now = new Date().toISOString();
    const validatedTodos = todos.map((todo, index) => {
      if (typeof todo !== 'object' || !todo.content) {
        throw new Error(`Todo at index ${index} must have content`);
      }
      
      return {
        id: todo.id || `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        content: todo.content,
        status: todo.status || 'pending',
        priority: todo.priority || 'medium',
        created: todo.created || now,
        updated: now,
        ...todo // Allow additional fields
      };
    });
    
    // Write to file with pretty formatting
    const content = JSON.stringify(validatedTodos, null, 2);
    await fs.writeFile(todoFile, content, 'utf8');
    
    return {
      todos: validatedTodos,
      count: validatedTodos.length,
      file: todoFile,
      bytesWritten: Buffer.byteLength(content, 'utf8'),
      success: true
    };
  } catch (error) {
    logger.error('Failed to write todos:', error.message);
    return {
      todos: [],
      count: 0,
      error: error.message,
      success: false
    };
  }
}

/**
 * Navigate to a URL with a browser and extract data
 * @param {string} url - URL to navigate to
 * @param {string} waitFor - Wait condition (networkidle, domcontentloaded, load)
 * @param {boolean} screenshot - Whether to take a screenshot
 * @param {Object} extractData - Selectors for data extraction
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function browserNavigate(url, waitFor = 'networkidle', screenshot = false, extractData = {}, logger) {
  let browser = null;
  try {
    logger.debug('Starting browser navigation:', { url, waitFor, screenshot });
    
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the URL
    await page.goto(url, { waitUntil: waitFor, timeout: 30000 });
    
    // Extract data based on selectors
    const extracted = {};
    for (const [key, selector] of Object.entries(extractData)) {
      try {
        if (selector.endsWith('[href]') || selector.endsWith('[src]')) {
          // Extract attribute values
          const attr = selector.includes('[href]') ? 'href' : 'src';
          const baseSelector = selector.replace(/\[.*\]$/, '');
          const elements = await page.$$eval(baseSelector, (els, attribute) => 
            els.map(el => el.getAttribute(attribute)).filter(Boolean), attr);
          extracted[key] = elements;
        } else {
          // Extract text content
          const elements = await page.$$eval(selector, els => 
            els.map(el => el.textContent.trim()).filter(Boolean));
          extracted[key] = elements.length === 1 ? elements[0] : elements;
        }
      } catch (extractError) {
        extracted[key] = null;
        logger.warn(`Failed to extract ${key}:`, extractError.message);
      }
    }
    
    // Take screenshot if requested
    let screenshotPath = null;
    if (screenshot) {
      screenshotPath = path.resolve(`./screenshot_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    
    await browser.close();
    
    return {
      url,
      title: await page.title(),
      extractedData: extracted,
      screenshotPath,
      success: true
    };
    
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    logger.error('Browser navigation failed:', error.message);
    return {
      url,
      error: error.message,
      success: false
    };
  }
}

/**
 * Perform browser interactions (clicks, typing, etc.)
 * @param {Array} actions - Array of actions to perform
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function browserInteract(actions, logger) {
  let browser = null;
  try {
    logger.debug('Starting browser interactions:', { actionCount: actions.length });
    
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const results = [];
    
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'goto':
            await page.goto(action.url, { waitUntil: action.waitFor || 'networkidle', timeout: 30000 });
            results.push({ type: 'goto', url: action.url, success: true });
            break;
            
          case 'click':
            await page.click(action.selector, { timeout: 10000 });
            results.push({ type: 'click', selector: action.selector, success: true });
            break;
            
          case 'type':
            await page.fill(action.selector, action.text);
            results.push({ type: 'type', selector: action.selector, text: action.text, success: true });
            break;
            
          case 'wait':
            if (action.selector) {
              await page.waitForSelector(action.selector, { timeout: 10000 });
              results.push({ type: 'wait', selector: action.selector, success: true });
            } else if (action.timeout) {
              await page.waitForTimeout(action.timeout);
              results.push({ type: 'wait', timeout: action.timeout, success: true });
            }
            break;
            
          case 'extract':
            const extracted = {};
            for (const [key, selector] of Object.entries(action.data || {})) {
              try {
                const elements = await page.$$eval(selector, els => 
                  els.map(el => el.textContent.trim()).filter(Boolean));
                extracted[key] = elements.length === 1 ? elements[0] : elements;
              } catch (extractError) {
                extracted[key] = null;
              }
            }
            results.push({ type: 'extract', data: extracted, success: true });
            break;
            
          case 'screenshot':
            const screenshotPath = path.resolve(`./screenshot_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: action.fullPage || false });
            results.push({ type: 'screenshot', path: screenshotPath, success: true });
            break;
            
          default:
            results.push({ type: action.type, error: 'Unknown action type', success: false });
        }
      } catch (actionError) {
        results.push({ 
          type: action.type, 
          error: actionError.message, 
          success: false 
        });
      }
    }
    
    await browser.close();
    
    return {
      actions: results,
      totalActions: actions.length,
      successfulActions: results.filter(r => r.success).length,
      success: true
    };
    
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    logger.error('Browser interaction failed:', error.message);
    return {
      actions: [],
      error: error.message,
      success: false
    };
  }
}

/**
 * Perform HTTP fetch request
 * @param {string} url - URL to fetch
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object} headers - Request headers
 * @param {Object} data - Request body data
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Object>} Operation result
 */
async function httpFetch(url, method = 'GET', headers = {}, data = null, logger) {
  try {
    logger.debug('Making HTTP request:', { url, method });
    
    const config = {
      method,
      headers: {
        'User-Agent': 'AIMaster-Agent/1.0',
        ...headers
      },
      timeout: 30000
    };
    
    if (data && method !== 'GET') {
      if (typeof data === 'object') {
        config.data = data;
        config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
      } else {
        config.data = data;
      }
    }
    
    const response = await axios(url, config);
    
    return {
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      size: JSON.stringify(response.data).length,
      success: true
    };
    
  } catch (error) {
    logger.error('HTTP fetch failed:', error.message);
    
    return {
      url,
      method,
      status: error.response?.status || 0,
      statusText: error.response?.statusText || 'Error',
      error: error.message,
      success: false
    };
  }
}

/**
 * Get creative logging message for tool usage
 * @param {string} toolName - Name of the tool being used
 * @param {Object} args - Tool arguments
 * @param {Object} result - Tool execution result
 * @param {boolean} interactive - Whether in interactive mode
 * @returns {string} Formatted log message
 */
function getToolLogMessage(toolName, args, result, interactive = false) {
  const prefix = interactive ? '🤖 AIM' : 'AIM';
  
  switch (toolName) {
    case 'execute_shell_command':
      const cmd = args?.command || 'unknown command';
      const shortCmd = cmd.length > 50 ? cmd.substring(0, 47) + '...' : cmd;
      return `${prefix} executed: ${shortCmd}`;
      
    case 'read_file':
      const readPath = args?.file_path || 'unknown file';
      const fileName = path.basename(readPath);
      return `${prefix} read ${fileName} (${readPath})`;
      
    case 'write_file':
      const writePath = args?.file_path || 'unknown file';
      const writeFileName = path.basename(writePath);
      const bytes = result?.bytesWritten || 0;
      return `${prefix} created ${writeFileName} (${writePath}) - ${bytes} bytes`;
      
    case 'append_to_file':
      const appendPath = args?.file_path || 'unknown file';
      const appendFileName = path.basename(appendPath);
      const appendBytes = result?.bytesAppended || 0;
      return `${prefix} appended to ${appendFileName} (${appendPath}) - ${appendBytes} bytes`;
      
    case 'list_directory':
      const dirPath = args?.directory_path || 'unknown directory';
      const dirName = path.basename(dirPath) || dirPath;
      const count = result?.count || 0;
      return `${prefix} listed ${dirName}/ (${count} items)`;
      
    case 'create_directory':
      const createPath = args?.directory_path || 'unknown directory';
      const createDirName = path.basename(createPath);
      return `${prefix} created directory ${createDirName}/ (${createPath})`;
      
    case 'copy_files':
      const copySource = args?.source || 'unknown';
      const copyDest = args?.destination || 'unknown';
      const sourceBasename = path.basename(copySource);
      const destBasename = path.basename(copyDest);
      return `${prefix} copied ${sourceBasename} → ${destBasename}`;
      
    case 'move_files':
      const moveSource = args?.source || 'unknown';
      const moveDest = args?.destination || 'unknown';
      const moveSourceBasename = path.basename(moveSource);
      const moveDestBasename = path.basename(moveDest);
      return `${prefix} moved ${moveSourceBasename} → ${moveDestBasename}`;
      
    case 'delete_file':
      const deletePath = args?.file_path || 'unknown file';
      const deleteFileName = path.basename(deletePath);
      return `${prefix} deleted ${deleteFileName} (${deletePath})`;
      
    case 'get_file_info':
      const infoPath = args?.file_path || 'unknown file';
      const infoFileName = path.basename(infoPath);
      const fileType = result?.type || 'unknown';
      const size = result?.size || 0;
      return `${prefix} inspected ${infoFileName} (${fileType}, ${size} bytes)`;
      
    case 'search_files':
      const searchPath = args?.search_path || 'unknown path';
      const pattern = args?.pattern || '*';
      const searchCount = result?.count || 0;
      return `${prefix} searched for "${pattern}" in ${path.basename(searchPath)}/ (${searchCount} matches)`;
      
    case 'find_and_replace':
      const searchText = args?.search_text || 'unknown';
      const replaceText = args?.replace_text || 'unknown';
      const filesModified = result?.filesModified || 0;
      const totalReplacements = result?.totalReplacements || 0;
      return `${prefix} replaced "${searchText}" → "${replaceText}" in ${filesModified} files (${totalReplacements} changes)`;
      
    case 'ripgrep_search':
      const rgPattern = args?.pattern || 'unknown';
      const rgPath = args?.search_path || '.';
      const rgMatches = result?.totalMatches || 0;
      const rgFiles = result?.filesWithMatches || 0;
      const rgFileType = args?.options?.fileType ? ` (${args.options.fileType} files)` : '';
      return `${prefix} searched "${rgPattern}" in ${path.basename(rgPath)}/${rgFileType} → ${rgMatches} matches in ${rgFiles} files`;
      
    case 'todo_read':
      const todoCount = result?.count || 0;
      const pendingCount = result?.todos?.filter(t => t.status === 'pending').length || 0;
      return `${prefix} checked todos (${todoCount} total, ${pendingCount} pending)`;
      
    case 'todo_write':
      const writtenCount = result?.count || 0;
      const addedCount = args?.todos?.length || 0;
      return `${prefix} updated todos (${writtenCount} items, ${addedCount} changes)`;

    case 'browser_navigate':
      const navUrl = args?.url || 'unknown URL';
      const navDomain = new URL(navUrl).hostname;
      const extracted = Object.keys(result?.extractedData || {}).length;
      return `${prefix} navigated to ${navDomain} (extracted ${extracted} data fields)`;

    case 'browser_interact':
      const actionCount = args?.actions?.length || 0;
      const successCount = result?.successfulActions || 0;
      return `${prefix} performed ${successCount}/${actionCount} browser actions`;

    case 'http_fetch':
      const fetchUrl = args?.url || 'unknown URL';
      const fetchDomain = new URL(fetchUrl).hostname;
      const status = result?.status || 0;
      const responseSize = result?.size || 0;
      return `${prefix} fetched ${fetchDomain} (${status}, ${responseSize} bytes)`;
      
    default:
      return `${prefix} used ${toolName}`;
  }
}

/**
 * Execute tools from agent response
 * @param {ToolCall[]} tools - Array of tool calls
 * @param {Logger} logger - Logger instance
 * @param {boolean} interactive - Whether in interactive mode
 * @returns {Promise<Object[]>} Array of tool results
 */
async function executeTools(tools, logger, interactive = false) {
  if (!tools || !Array.isArray(tools)) {
    return [];
  }
  
  const results = [];
  const templateContext = {}; // Store tool results for templating
  
  // Helper function to log tool usage and add to results
  const logAndAddResult = (toolName, args, result, toolId, error = null) => {
    if (!error && result) {
      const logMessage = getToolLogMessage(toolName, args, result, interactive);
      if (interactive) {
        logger.info(logMessage);
      } else {
        logger.info('Tool executed', { tool: toolName, details: logMessage });
      }
    }
    
    const resultObj = {
      id: toolId
    };
    
    if (error) {
      resultObj.error = error;
    } else {
      resultObj.result = result;
      // Store successful results in template context for subsequent tools
      templateContext[toolId] = result;
    }
    
    results.push(resultObj);
  };
  
  try {
    // Build dependency graph and determine execution order
    const { order } = TemplateProcessor.buildDependencyGraph(tools);
    
    // Create a map for quick tool lookup by ID
    const toolMap = new Map();
    tools.forEach(tool => toolMap.set(tool.id, tool));
    
    // Execute tools in dependency order
    for (const toolId of order) {
      const tool = toolMap.get(toolId);
      if (!tool) continue;
      
      const toolName = tool.function?.name;
      let args = tool.function?.arguments || {};
      
      try {
        // Process template variables in arguments
        args = TemplateProcessor.processArguments(args, templateContext);
        
        let result = null;
        
        switch (toolName) {
          case 'execute_shell_command':
            if (!args?.command) {
              logAndAddResult(toolName, args, null, tool.id, 'No command provided');
              break;
            }
            result = await executeShellCommand(args.command, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'read_file':
            if (!args?.file_path) {
              logAndAddResult(toolName, args, null, tool.id, 'No file_path provided');
              break;
            }
            result = await readFile(args.file_path, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'write_file':
            if (!args?.file_path || args?.content === undefined) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path and content are required');
              break;
            }
            result = await writeFile(args.file_path, args.content, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'append_to_file':
            if (!args?.file_path || args?.content === undefined) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path and content are required');
              break;
            }
            result = await appendToFile(args.file_path, args.content, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'list_directory':
            if (!args?.directory_path) {
              logAndAddResult(toolName, args, null, tool.id, 'directory_path is required');
              break;
            }
            result = await listDirectory(args.directory_path, args.detailed || false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'create_directory':
            if (!args?.directory_path) {
              logAndAddResult(toolName, args, null, tool.id, 'directory_path is required');
              break;
            }
            result = await createDirectory(args.directory_path, args.recursive !== false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'copy_files':
            if (!args?.source || !args?.destination) {
              logAndAddResult(toolName, args, null, tool.id, 'source and destination are required');
              break;
            }
            result = await copyFiles(args.source, args.destination, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'move_files':
            if (!args?.source || !args?.destination) {
              logAndAddResult(toolName, args, null, tool.id, 'source and destination are required');
              break;
            }
            result = await moveFiles(args.source, args.destination, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'delete_file':
            if (!args?.file_path) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path is required');
              break;
            }
            result = await deleteFile(args.file_path, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'get_file_info':
            if (!args?.file_path) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path is required');
              break;
            }
            result = await getFileInfo(args.file_path, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'search_files':
            if (!args?.search_path || !args?.pattern) {
              logAndAddResult(toolName, args, null, tool.id, 'search_path and pattern are required');
              break;
            }
            result = await searchFiles(args.search_path, args.pattern, args.recursive !== false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'find_and_replace':
            if (!args?.search_path || !args?.search_text || args?.replace_text === undefined) {
              logAndAddResult(toolName, args, null, tool.id, 'search_path, search_text, and replace_text are required');
              break;
            }
            result = await findAndReplace(args.search_path, args.search_text, args.replace_text, args.file_pattern || '*', args.recursive !== false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'ripgrep_search':
            if (!args?.pattern) {
              logAndAddResult(toolName, args, null, tool.id, 'pattern is required');
              break;
            }
            result = await ripgrepSearch(args.pattern, args.search_path || '.', args.options || {}, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'todo_read':
            result = await todoRead(logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'todo_write':
            if (!args?.todos || !Array.isArray(args.todos)) {
              logAndAddResult(toolName, args, null, tool.id, 'todos array is required');
              break;
            }
            result = await todoWrite(args.todos, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'browser_navigate':
            if (!args?.url) {
              logAndAddResult(toolName, args, null, tool.id, 'url is required');
              break;
            }
            result = await browserNavigate(args.url, args.waitFor, args.screenshot, args.extractData || {}, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'browser_interact':
            if (!args?.actions || !Array.isArray(args.actions)) {
              logAndAddResult(toolName, args, null, tool.id, 'actions array is required');
              break;
            }
            result = await browserInteract(args.actions, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'http_fetch':
            if (!args?.url) {
              logAndAddResult(toolName, args, null, tool.id, 'url is required');
              break;
            }
            result = await httpFetch(args.url, args.method, args.headers, args.data, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;
            
          default:
            logAndAddResult(toolName, args, null, tool.id, `Unknown tool: ${toolName}`);
        }
      } catch (error) {
        logger.error('Tool execution error', { toolId: tool.id, error: error.message });
        logAndAddResult(toolName, args, null, tool.id, error.message);
      }
    }
  } catch (dependencyError) {
    // If dependency resolution fails, fall back to original sequential execution
    logger.warn('Template dependency resolution failed, falling back to sequential execution', { error: dependencyError.message });
    
    for (const tool of tools) {
      const toolName = tool.function?.name;
      const args = tool.function?.arguments || {};
      
      try {
        let result = null;
        
        switch (toolName) {
          case 'execute_shell_command':
            if (!args?.command) {
              logAndAddResult(toolName, args, null, tool.id, 'No command provided');
              break;
            }
            result = await executeShellCommand(args.command, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'read_file':
            if (!args?.file_path) {
              logAndAddResult(toolName, args, null, tool.id, 'No file_path provided');
              break;
            }
            result = await readFile(args.file_path, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'write_file':
            if (!args?.file_path || args?.content === undefined) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path and content are required');
              break;
            }
            result = await writeFile(args.file_path, args.content, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'append_to_file':
            if (!args?.file_path || args?.content === undefined) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path and content are required');
              break;
            }
            result = await appendToFile(args.file_path, args.content, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'list_directory':
            if (!args?.directory_path) {
              logAndAddResult(toolName, args, null, tool.id, 'directory_path is required');
              break;
            }
            result = await listDirectory(args.directory_path, args.detailed || false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'create_directory':
            if (!args?.directory_path) {
              logAndAddResult(toolName, args, null, tool.id, 'directory_path is required');
              break;
            }
            result = await createDirectory(args.directory_path, args.recursive !== false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'copy_files':
            if (!args?.source || !args?.destination) {
              logAndAddResult(toolName, args, null, tool.id, 'source and destination are required');
              break;
            }
            result = await copyFiles(args.source, args.destination, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'move_files':
            if (!args?.source || !args?.destination) {
              logAndAddResult(toolName, args, null, tool.id, 'source and destination are required');
              break;
            }
            result = await moveFiles(args.source, args.destination, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'delete_file':
            if (!args?.file_path) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path is required');
              break;
            }
            result = await deleteFile(args.file_path, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'get_file_info':
            if (!args?.file_path) {
              logAndAddResult(toolName, args, null, tool.id, 'file_path is required');
              break;
            }
            result = await getFileInfo(args.file_path, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'search_files':
            if (!args?.search_path || !args?.pattern) {
              logAndAddResult(toolName, args, null, tool.id, 'search_path and pattern are required');
              break;
            }
            result = await searchFiles(args.search_path, args.pattern, args.recursive !== false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'find_and_replace':
            if (!args?.search_path || !args?.search_text || args?.replace_text === undefined) {
              logAndAddResult(toolName, args, null, tool.id, 'search_path, search_text, and replace_text are required');
              break;
            }
            result = await findAndReplace(args.search_path, args.search_text, args.replace_text, args.file_pattern || '*', args.recursive !== false, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'ripgrep_search':
            if (!args?.pattern) {
              logAndAddResult(toolName, args, null, tool.id, 'pattern is required');
              break;
            }
            result = await ripgrepSearch(args.pattern, args.search_path || '.', args.options || {}, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'todo_read':
            result = await todoRead(logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'todo_write':
            if (!args?.todos || !Array.isArray(args.todos)) {
              logAndAddResult(toolName, args, null, tool.id, 'todos array is required');
              break;
            }
            result = await todoWrite(args.todos, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'browser_navigate':
            if (!args?.url) {
              logAndAddResult(toolName, args, null, tool.id, 'url is required');
              break;
            }
            result = await browserNavigate(args.url, args.waitFor, args.screenshot, args.extractData || {}, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'browser_interact':
            if (!args?.actions || !Array.isArray(args.actions)) {
              logAndAddResult(toolName, args, null, tool.id, 'actions array is required');
              break;
            }
            result = await browserInteract(args.actions, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;

          case 'http_fetch':
            if (!args?.url) {
              logAndAddResult(toolName, args, null, tool.id, 'url is required');
              break;
            }
            result = await httpFetch(args.url, args.method, args.headers, args.data, logger);
            logAndAddResult(toolName, args, result, tool.id);
            break;
            
          default:
            logAndAddResult(toolName, args, null, tool.id, `Unknown tool: ${toolName}`);
        }
      } catch (error) {
        logger.error('Tool execution error', { toolId: tool.id, error: error.message });
        logAndAddResult(toolName, args, null, tool.id, error.message);
      }
    }
  }
  
  return results;
}

/**
 * Advanced streaming JSON parser that handles partial field completion
 */
class StreamingJSONParser {
  constructor() {
    this.buffer = '';
    this.state = 'waiting'; // waiting, in_object, in_field_name, in_field_value
    this.currentField = '';
    this.currentValue = '';
    this.bracketCount = 0;
    this.arrayCount = 0;
    this.inString = false;
    this.escaped = false;
    this.completedFields = {};
    this.partialUpdates = [];
  }

  addChunk(chunk) {
    this.buffer += chunk;
    const updates = [];
    
    let i = 0;
    while (i < this.buffer.length) {
      const char = this.buffer[i];
      
      if (this.escaped) {
        this.escaped = false;
        i++;
        continue;
      }
      
      if (char === '\\' && this.inString) {
        this.escaped = true;
        i++;
        continue;
      }
      
      if (char === '"' && !this.escaped) {
        this.inString = !this.inString;
        i++;
        continue;
      }
      
      // Track JSON structure
      if (!this.inString) {
        if (char === '{') {
          this.bracketCount++;
          if (this.bracketCount === 1) {
            this.state = 'in_object';
          }
        } else if (char === '}') {
          this.bracketCount--;
          if (this.bracketCount === 0) {
            // Complete JSON object
            try {
              const parsed = JSON.parse(this.buffer.substring(0, i + 1));
              updates.push({ type: 'complete', data: parsed });
              this.reset();
              this.buffer = this.buffer.substring(i + 1);
              i = -1;
            } catch (e) {
              // Continue parsing
            }
          }
        } else if (char === '[') {
          this.arrayCount++;
        } else if (char === ']') {
          this.arrayCount--;
        }
        
        // Try to extract complete fields
        if (this.bracketCount === 1 && this.arrayCount === 0) {
          const fieldMatch = this.tryExtractField(i);
          if (fieldMatch) {
            updates.push({ type: 'field', field: fieldMatch.name, value: fieldMatch.value });
            i = fieldMatch.endIndex;
            continue;
          }
        }
      }
      
      i++;
    }
    
    return updates;
  }
  
  tryExtractField(currentIndex) {
    // Look for complete field patterns like "field": "value" or "field": {...}
    const remainingBuffer = this.buffer.substring(0, currentIndex + 1);
    
    // Find field pattern: "fieldname": "value"
    const fieldStartRegex = /"([^"]+)":\s*"/g;
    let fieldMatch = fieldStartRegex.exec(remainingBuffer);
    
    if (fieldMatch && !this.completedFields[fieldMatch[1]]) {
      const fieldName = fieldMatch[1];
      const valueStartIndex = fieldMatch.index + fieldMatch[0].length;
      
      // Extract string value by counting escapes properly
      const extractedValue = this.extractStringValue(remainingBuffer, valueStartIndex);
      
      if (extractedValue !== null) {
        this.completedFields[fieldName] = extractedValue.value;
        return {
          name: fieldName,
          value: extractedValue.value,
          endIndex: extractedValue.endIndex
        };
      }
    }
    
    return null;
  }
  
  /**
   * Extract a JSON string value by properly counting escape sequences
   * @param {string} buffer - Buffer containing the JSON
   * @param {number} startIndex - Index where the string value starts (after opening quote)
   * @returns {Object|null} Extracted value and end index, or null if incomplete
   */
  extractStringValue(buffer, startIndex) {
    let i = startIndex;
    let value = '';
    let escapeCount = 0;
    
    while (i < buffer.length) {
      const char = buffer[i];
      
      if (char === '\\') {
        escapeCount++;
        value += char;
      } else if (char === '"') {
        // Check if this quote is escaped (odd number of preceding backslashes)
        if (escapeCount % 2 === 0) {
          // Unescaped quote - end of string
          return {
            value: value,
            endIndex: i + 1 // Include the closing quote
          };
        }
        // Escaped quote - continue
        value += char;
        escapeCount = 0;
      } else {
        value += char;
        escapeCount = 0;
      }
      
      i++;
    }
    
    // Incomplete string (no closing quote found)
    return null;
  }
  
  reset() {
    this.state = 'waiting';
    this.currentField = '';
    this.currentValue = '';
    this.bracketCount = 0;
    this.arrayCount = 0;
    this.inString = false;
    this.escaped = false;
    this.completedFields = {};
  }
  
  getPartialContent() {
    // Extract partial content from buffer for real-time display using proper escape counting
    
    // Try to extract thoughts field
    const thoughtsFieldMatch = this.buffer.match(/"thoughts":\s*"/);
    if (thoughtsFieldMatch) {
      const valueStartIndex = thoughtsFieldMatch.index + thoughtsFieldMatch[0].length;
      const thoughtsValue = this.extractStringValue(this.buffer, valueStartIndex);
      if (thoughtsValue) {
        return { type: 'thoughts', content: thoughtsValue.value };
      }
    }
    
    // Try to extract content field
    const contentFieldMatch = this.buffer.match(/"content":\s*"/);
    if (contentFieldMatch) {
      const valueStartIndex = contentFieldMatch.index + contentFieldMatch[0].length;
      const contentValue = this.extractStringValue(this.buffer, valueStartIndex);
      if (contentValue) {
        return { type: 'content', content: contentValue.value };
      }
    }
    
    return null;
  }
}


/**
 * Handle streaming response with progressive field-by-field output
 */
async function handleStreamingResponse(response, logger, callbacks, spinner) {
  return new Promise((resolve, reject) => {
    let accumulatedContent = '';
    let finalResponse = null;
    const parser = new StreamingJSONParser();
    let thinkingDisplayed = false;
    let contentDisplayed = false;
    
    const { onThoughts, onContent, onFieldComplete, interactive } = callbacks || {};
    
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            if (spinner) spinner.stop();
            
            // Try to parse accumulated content as final JSON
            if (accumulatedContent.trim()) {
              try {
                finalResponse = JSON.parse(accumulatedContent);
              } catch (e) {
                logger.warn('Could not parse final accumulated content as JSON');
                finalResponse = {
                  thoughts: parser.completedFields.thoughts || '',
                  content: parser.completedFields.content || accumulatedContent,
                  reasoning: "Streamed content was not valid JSON"
                };
              }
            }
            
            resolve(finalResponse || { 
              thoughts: parser.completedFields.thoughts || '',
              content: parser.completedFields.content || accumulatedContent 
            });
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta?.content;
            
            if (delta) {
              accumulatedContent += delta;
              
              // Parse field updates and complete objects
              const updates = parser.addChunk(delta);
              
              for (const update of updates) {
                if (update.type === 'field') {
                  // Field completed
                  if (onFieldComplete) {
                    onFieldComplete(update.field, update.value);
                  }
                  
                  if (update.field === 'thoughts' && onThoughts && !thinkingDisplayed) {
                    if (spinner) spinner.stop();
                    onThoughts(update.value);
                    thinkingDisplayed = true;
                  } else if (update.field === 'content' && onContent && !contentDisplayed) {
                    onContent(update.value);
                    contentDisplayed = true;
                  }
                } else if (update.type === 'complete') {
                  // Complete JSON object
                  finalResponse = update.data;
                }
              }
              
              // Show partial content for real-time streaming if in interactive mode
              if (interactive && !thinkingDisplayed && !contentDisplayed) {
                const partial = parser.getPartialContent();
                if (partial) {
                  if (partial.type === 'thoughts' && onThoughts) {
                    if (spinner) spinner.stop();
                    onThoughts(partial.content, true); // true = partial
                    thinkingDisplayed = true;
                  } else if (partial.type === 'content' && onContent) {
                    onContent(partial.content, true); // true = partial
                    contentDisplayed = true;
                  }
                }
              }
            }
          } catch (e) {
            // Skip invalid JSON chunks
          }
        }
      }
    });
    
    response.data.on('end', () => {
      if (spinner) spinner.stop();
      
      if (!finalResponse) {
        // Fallback: try to parse accumulated content
        try {
          finalResponse = JSON.parse(accumulatedContent);
        } catch (e) {
          finalResponse = {
            thoughts: parser.completedFields.thoughts || '',
            content: parser.completedFields.content || accumulatedContent,
            reasoning: "Could not parse streaming response as JSON"
          };
        }
      }
      
      resolve(finalResponse);
    });
    
    response.data.on('error', (error) => {
      if (spinner) spinner.stop();
      logger.error('Streaming error', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Make a completion request to the LLM API
 * @param {string} userPrompt - The user's prompt
 * @param {Config} config - Configuration object
 * @param {Logger} logger - Logger instance
 * @returns {Promise<AgentResponse>} The agent's response
 */
async function getCompletion(userPrompt, config, logger, options = {}) {
  const { interactive = false, callbacks = {}, spinner = null } = options;
  try {
    logger.debug('Making API request', { url: config.apiUrl, streaming: true });
    
    // Always use streaming for performance, but handle differently based on mode
    const response = await axios.post(`${config.apiUrl}/v1/chat/completions`, {
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true // Always stream for performance
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000,
      responseType: 'stream'
    });

    // Use the enhanced streaming handler with field-by-field parsing
    return await handleStreamingResponse(response, logger, { ...callbacks, interactive }, spinner);

  } catch (error) {
    logger.error('API request failed', { error: error.message });
    
    if (error.code === 'ECONNREFUSED') {
      logger.error('Connection refused. Is the LLM server running?');
    }
    
    return {
      content: `Error: ${error.message}`,
      reasoning: "API request failed"
    };
  }
}

/**
 * Display formatted content with proper styling
 */
function displayContent(content, interactive = false) {
  if (!interactive) {
    // Non-interactive mode - just output the content
    console.log(content);
    return;
  }
  
  // Interactive mode - styled output
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      console.log(chalk.gray(line));
    } else if (line.trim().startsWith('#')) {
      console.log(chalk.bold.blue(line));
    } else if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
      console.log(chalk.yellow(line));
    } else {
      console.log(line);
    }
  }
}

/**
 * Run in non-interactive mode (backward compatibility)
 */
async function runNonInteractive() {
  const config = getConfig();
  const logger = new Logger(config.logLevel, true); // JSON mode
  
  // Get user prompt from command line arguments  
  const args = process.argv.slice(2);
  const promptArgs = [];
  
  // Filter out configuration flags to get the actual prompt
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--api-url', '--model', '--log-level', '--max-tokens', '--temperature', '--interactive', '--stream'].includes(arg)) {
      if (!['--interactive', '--stream'].includes(arg)) {
        i++; // Skip the next argument (the value) for config flags
      }
      continue;
    }
    promptArgs.push(arg);
  }
  
  const userPrompt = promptArgs.join(' ');
  
  if (!userPrompt) {
    logger.error('No prompt provided. Usage: node agent.mjs [options] <prompt>');
    process.exit(1);
  }
  
  logger.info('Starting request', { prompt: userPrompt });
  
  // Non-interactive mode uses streaming internally but buffers output
  const response = await getCompletion(userPrompt, config, logger, { 
    interactive: false
    // No callbacks needed - we just want the final buffered result
  });
  
  // Execute any tools if present
  if (response.tools && response.tools.length > 0) {
    logger.info('Executing tools', { count: response.tools.length });
    const toolResults = await executeTools(response.tools, logger, false);
    
    // Add tool results to the response
    response.tool_results = toolResults;
  }
  
  // Output the response as JSON
  console.log(JSON.stringify(response, null, 2));
}

/**
 * Run in interactive mode with beautiful UI
 */
async function runInteractive() {
  const config = getConfig();
  const logger = new Logger(config.logLevel, false); // Pretty mode
  
  // Beautiful welcome screen
  console.log(chalk.bold.cyan('\n🤖 AIMaster (AIM) - Interactive AI Assistant\n'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  console.log(chalk.blue('Configuration:'));
  console.log(chalk.gray(`  API URL: ${config.apiUrl}`));
  console.log(chalk.gray(`  Model: ${config.model}`));
  console.log(chalk.gray(`  Temperature: ${config.temperature}`));
  console.log(chalk.gray(`  Max Tokens: ${config.maxTokens}\n`));
  
  while (true) {
    try {
      // Get user input
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'prompt',
          message: chalk.bold.green('What can I help you with?'),
          validate: (input) => input.trim().length > 0 || 'Please enter a prompt'
        }
      ]);
      
      if (answers.prompt.toLowerCase() === 'exit' || answers.prompt.toLowerCase() === 'quit') {
        console.log(chalk.yellow('\n👋 Goodbye!'));
        break;
      }
      
      console.log(chalk.gray('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
      
      // Start spinner
      const spinner = ora({
        text: chalk.blue('Connecting to AI...'),
        spinner: 'dots',
        color: 'blue'
      }).start();
      
      let thinkingShown = false;
      let contentShown = false;
      
      // Beautiful thinking display
      const onThoughts = (thoughts, isPartial = false) => {
        if (!thinkingShown) {
          console.log(chalk.bold.magenta('🧠 AI Thinking:'));
          console.log(chalk.gray('┌─ ' + '─'.repeat(60)));
          thinkingShown = true;
        }
        
        if (isPartial) {
          // For partial thoughts, show character by character
          process.stdout.write(chalk.italic.gray(thoughts));
        } else {
          // Complete thoughts
          console.log(chalk.italic.gray(`│ ${thoughts}`));
          console.log(chalk.gray('└─ ' + '─'.repeat(60)));
        }
      };
      
      // Content display
      const onContent = (content, isPartial = false) => {
        if (!contentShown) {
          console.log(chalk.bold.cyan('\n💬 AIM Response:'));
          contentShown = true;
        }
        
        if (isPartial) {
          process.stdout.write(content);
        } else {
          displayContent(content, true);
        }
      };
      
      // Field completion callback
      const onFieldComplete = (field, value) => {
        if (field === 'thoughts') {
          console.log(chalk.gray('└─ ' + '─'.repeat(60)));
        }
      };
      
      // Get AI response with beautiful real-time display
      const response = await getCompletion(answers.prompt, config, logger, {
        interactive: true,
        callbacks: {
          onThoughts,
          onContent,
          onFieldComplete
        },
        spinner
      });
      
      // Fallback display if streaming didn't show content
      if (!contentShown && response.content) {
        console.log(chalk.bold.cyan('\n💬 AIM Response:'));
        displayContent(response.content, true);
      }
      
      // Execute tools if present
      if (response.tools && response.tools.length > 0) {
        console.log(chalk.yellow(`\n🔧 Executing ${response.tools.length} tool(s)...\n`));
        
        const toolSpinner = ora({
          text: chalk.yellow('Running commands...'),
          spinner: 'arrow3',
          color: 'yellow'
        }).start();
        
        const toolResults = await executeTools(response.tools, logger, true);
        toolSpinner.stop();
        
        // Tool results are already logged via logAndAddResult, 
        // but show shell command output if available
        for (const result of toolResults) {
          if (result.result && result.result.stdout) {
            console.log(chalk.gray('📤 Output:'));
            console.log(chalk.gray(result.result.stdout));
          }
          if (result.result && result.result.stderr) {
            console.log(chalk.red('⚠️  Errors:'));
            console.log(chalk.red(result.result.stderr));
          }
          if (result.error) {
            console.log(chalk.red(`❌ Tool failed: ${result.error}`));
          }
        }
        
        response.tool_results = toolResults;
      }
      
      // Show reasoning if available
      if (response.reasoning) {
        console.log(chalk.gray(`\n💭 Reasoning: ${response.reasoning}`));
      }
      
      console.log(chalk.gray('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    }
  }
}

/**
 * Main function to run the agent
 */
async function main() {
  // Setup CLI
  program
    .name('aimaster')
    .description('AIMaster (AIM) - AI Agent with tool support')
    .version('1.0.0')
    .option('--api-url <url>', 'API endpoint URL', DEFAULT_CONFIG.apiUrl)
    .option('--model <model>', 'Model name', DEFAULT_CONFIG.model)
    .option('--log-level <level>', 'Log level (debug, info, warn, error)', DEFAULT_CONFIG.logLevel)
    .option('--max-tokens <tokens>', 'Maximum response tokens', DEFAULT_CONFIG.maxTokens)
    .option('--temperature <temp>', 'Generation temperature', DEFAULT_CONFIG.temperature)
    .option('--interactive', 'Run in interactive mode with real-time thinking display')
    .argument('[prompt...]', 'Prompt for the AI (non-interactive mode)')
    .action(async (prompt, options) => {
      // Set environment variables from CLI options
      if (options.apiUrl) process.env.AIM_API_URL = options.apiUrl;
      if (options.model) process.env.AIM_MODEL = options.model;
      if (options.logLevel) process.env.AIM_LOG_LEVEL = options.logLevel;
      if (options.maxTokens) process.env.AIM_MAX_TOKENS = options.maxTokens.toString();
      if (options.temperature) process.env.AIM_TEMPERATURE = options.temperature.toString();
      
      // Determine mode
      const hasPrompt = prompt && prompt.length > 0;
      const isInteractive = options.interactive || !hasPrompt;
      
      if (isInteractive) {
        await runInteractive();
      } else {
        // Add prompt back to argv for backward compatibility
        if (hasPrompt) {
          process.argv = [...process.argv.slice(0, 2), ...prompt];
        }
        await runNonInteractive();
      }
    });
  
  program.parse();
}

// Run the main function if this module is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

export { 
  getCompletion, 
  getConfig, 
  Logger, 
  SYSTEM_PROMPT, 
  executeShellCommand, 
  executeTools,
  readFile,
  writeFile,
  appendToFile,
  listDirectory,
  createDirectory,
  copyFiles,
  moveFiles,
  deleteFile,
  getFileInfo,
  searchFiles,
  findAndReplace,
  ripgrepSearch,
  todoRead,
  todoWrite,
  getToolLogMessage,
  browserNavigate,
  browserInteract,
  httpFetch
};