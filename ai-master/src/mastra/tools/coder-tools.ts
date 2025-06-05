/**
 * Specialized tools for the Coder Agent
 * File operations, shell commands, code analysis, etc.
 */

import { createTool } from '@mastra/core';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// File Operations Tools
export const readFileTool = createTool({
  id: 'read_file',
  description: 'Read content from a file',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to read'),
  }),
  execute: async ({ filePath }) => {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf8');
      
      return {
        success: true,
        content,
        path: absolutePath,
        size: Buffer.byteLength(content, 'utf8'),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath,
      };
    }
  },
});

export const writeFileTool = createTool({
  id: 'write_file',
  description: 'Write content to a file',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write to the file'),
  }),
  execute: async ({ filePath, content }) => {
    try {
      const absolutePath = path.resolve(filePath);
      
      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(absolutePath, content, 'utf8');
      
      return {
        success: true,
        path: absolutePath,
        bytesWritten: Buffer.byteLength(content, 'utf8'),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath,
      };
    }
  },
});

export const appendFileTool = createTool({
  id: 'append_file',
  description: 'Append content to a file',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to append to'),
    content: z.string().describe('Content to append'),
  }),
  execute: async ({ filePath, content }) => {
    try {
      const absolutePath = path.resolve(filePath);
      
      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.appendFile(absolutePath, content, 'utf8');
      
      return {
        success: true,
        path: absolutePath,
        bytesAppended: Buffer.byteLength(content, 'utf8'),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath,
      };
    }
  },
});

export const listDirectoryTool = createTool({
  id: 'list_directory',
  description: 'List contents of a directory',
  inputSchema: z.object({
    directoryPath: z.string().describe('Path to the directory to list'),
    detailed: z.boolean().optional().describe('Include detailed file information'),
  }),
  execute: async ({ directoryPath, detailed = false }) => {
    try {
      const absolutePath = path.resolve(directoryPath);
      const entries = await fs.readdir(absolutePath);
      
      if (!detailed) {
        return {
          success: true,
          path: absolutePath,
          entries,
          count: entries.length,
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
            permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8),
          });
        } catch (entryError) {
          detailedEntries.push({
            name: entry,
            error: entryError.message,
          });
        }
      }
      
      return {
        success: true,
        path: absolutePath,
        entries: detailedEntries,
        count: detailedEntries.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: directoryPath,
      };
    }
  },
});

export const executeShellTool = createTool({
  id: 'execute_shell',
  description: 'Execute a shell command',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute'),
    workingDirectory: z.string().optional().describe('Working directory for the command'),
    timeout: z.number().optional().describe('Command timeout in milliseconds'),
  }),
  execute: async ({ command, workingDirectory, timeout = 30000 }) => {
    try {
      const options: any = {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
      };
      
      if (workingDirectory) {
        options.cwd = path.resolve(workingDirectory);
      }
      
      const { stdout, stderr } = await execAsync(command, options);
      
      return {
        success: true,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        workingDirectory: options.cwd || process.cwd(),
      };
    } catch (error) {
      return {
        success: false,
        command,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

export const searchFilesTool = createTool({
  id: 'search_files',
  description: 'Search for files by name pattern',
  inputSchema: z.object({
    searchPath: z.string().describe('Directory to search in'),
    pattern: z.string().describe('File name pattern (supports * and ?)'),
    recursive: z.boolean().optional().default(true).describe('Search recursively'),
  }),
  execute: async ({ searchPath, pattern, recursive = true }) => {
    try {
      const absolutePath = path.resolve(searchPath);
      const results = [];
      
      await searchFilesRecursive(absolutePath, pattern, recursive, results);
      
      return {
        success: true,
        searchPath: absolutePath,
        pattern,
        results,
        count: results.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        searchPath,
        pattern,
      };
    }
  },
});

export const createDirectoryTool = createTool({
  id: 'create_directory',
  description: 'Create a directory',
  inputSchema: z.object({
    directoryPath: z.string().describe('Path to the directory to create'),
    recursive: z.boolean().optional().default(true).describe('Create parent directories'),
  }),
  execute: async ({ directoryPath, recursive = true }) => {
    try {
      const absolutePath = path.resolve(directoryPath);
      await fs.mkdir(absolutePath, { recursive });
      
      return {
        success: true,
        path: absolutePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: directoryPath,
      };
    }
  },
});

// Helper function for recursive file search
async function searchFilesRecursive(dir: string, pattern: string, recursive: boolean, results: any[]) {
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
            modified: stats.mtime.toISOString(),
          });
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }
}

// Simple pattern matching for file names (supports * and ?)
function matchesPattern(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

// Export all coder tools
export const coderTools = [
  readFileTool,
  writeFileTool,
  appendFileTool,
  listDirectoryTool,
  executeShellTool,
  searchFilesTool,
  createDirectoryTool,
];