/**
 * Enhanced MCP Server for Coder Agent with directory navigation and git operations
 * This server provides tools that can work across different directories and repositories
 */

import { MCPServer } from '@mastra/mcp';
import { createTool } from '@mastra/core';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import * as ts from 'typescript';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';

const execAsync = promisify(exec);

// Session tracking system to prevent AI loops and track operations
class SessionTracker {
  private static instance: SessionTracker;
  private fileOperations: Map<string, {
    readCount: number;
    writeCount: number;
    lastReadTime: number;
    lastWriteTime: number;
    contentHashes: string[];
    lastDiagnostics?: any;
  }> = new Map();
  
  private sessionStartTime = Date.now();
  private readonly MAX_CONTENT_HISTORY = 5; // Keep last 5 content hashes
  private readonly DUPLICATE_THRESHOLD = 2; // Warn after 2 identical writes

  static getInstance(): SessionTracker {
    if (!SessionTracker.instance) {
      SessionTracker.instance = new SessionTracker();
    }
    return SessionTracker.instance;
  }

  private getContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private getFileKey(filePath: string): string {
    return path.resolve(filePath);
  }

  recordRead(filePath: string): {
    readCount: number;
    totalOperations: number;
    sessionDuration: number;
  } {
    const key = this.getFileKey(filePath);
    const record = this.fileOperations.get(key) || {
      readCount: 0,
      writeCount: 0,
      lastReadTime: 0,
      lastWriteTime: 0,
      contentHashes: [],
    };

    record.readCount++;
    record.lastReadTime = Date.now();
    this.fileOperations.set(key, record);

    return {
      readCount: record.readCount,
      totalOperations: record.readCount + record.writeCount,
      sessionDuration: Date.now() - this.sessionStartTime,
    };
  }

  recordWrite(filePath: string, content: string): {
    writeCount: number;
    totalOperations: number;
    sessionDuration: number;
    duplicateDetected: boolean;
    duplicateCount: number;
    isLikelyLoop: boolean;
    warning?: string;
  } {
    const key = this.getFileKey(filePath);
    const contentHash = this.getContentHash(content);
    
    const record = this.fileOperations.get(key) || {
      readCount: 0,
      writeCount: 0,
      lastReadTime: 0,
      lastWriteTime: 0,
      contentHashes: [],
    };

    record.writeCount++;
    record.lastWriteTime = Date.now();
    
    // Check for duplicate content
    const duplicateCount = record.contentHashes.filter(hash => hash === contentHash).length;
    const duplicateDetected = duplicateCount > 0;
    const isLikelyLoop = duplicateCount >= this.DUPLICATE_THRESHOLD;

    // Add to content history
    record.contentHashes.unshift(contentHash);
    if (record.contentHashes.length > this.MAX_CONTENT_HISTORY) {
      record.contentHashes = record.contentHashes.slice(0, this.MAX_CONTENT_HISTORY);
    }

    this.fileOperations.set(key, record);

    let warning;
    if (isLikelyLoop) {
      warning = `🔄 LOOP DETECTED: This exact content has been written ${duplicateCount + 1} times. AI may be stuck in a loop.`;
    } else if (duplicateDetected) {
      warning = `⚠️ DUPLICATE: This content was previously written to this file.`;
    }

    return {
      writeCount: record.writeCount,
      totalOperations: record.readCount + record.writeCount,
      sessionDuration: Date.now() - this.sessionStartTime,
      duplicateDetected,
      duplicateCount: duplicateCount + 1,
      isLikelyLoop,
      warning,
    };
  }

  getFileStats(filePath: string) {
    const key = this.getFileKey(filePath);
    const record = this.fileOperations.get(key);
    
    if (!record) {
      return {
        readCount: 0,
        writeCount: 0,
        totalOperations: 0,
        lastAccessed: null,
      };
    }

    return {
      readCount: record.readCount,
      writeCount: record.writeCount,
      totalOperations: record.readCount + record.writeCount,
      lastAccessed: Math.max(record.lastReadTime, record.lastWriteTime),
      lastReadTime: record.lastReadTime || null,
      lastWriteTime: record.lastWriteTime || null,
    };
  }

  getSessionSummary() {
    const files = Array.from(this.fileOperations.entries()).map(([filePath, record]) => ({
      filePath: path.basename(filePath),
      fullPath: filePath,
      ...record,
      totalOperations: record.readCount + record.writeCount,
    }));

    const totalReads = files.reduce((sum, f) => sum + f.readCount, 0);
    const totalWrites = files.reduce((sum, f) => sum + f.writeCount, 0);

    return {
      sessionDuration: Date.now() - this.sessionStartTime,
      totalFiles: files.length,
      totalReads,
      totalWrites,
      totalOperations: totalReads + totalWrites,
      files: files.sort((a, b) => b.totalOperations - a.totalOperations),
    };
  }

  storeDiagnostics(filePath: string, diagnostics: any) {
    const key = this.getFileKey(filePath);
    const record = this.fileOperations.get(key);
    if (record) {
      record.lastDiagnostics = diagnostics;
      this.fileOperations.set(key, record);
    }
  }

  getLastDiagnostics(filePath: string) {
    const key = this.getFileKey(filePath);
    const record = this.fileOperations.get(key);
    return record?.lastDiagnostics;
  }
}


// Enhanced tools with directory context
export const changeDirectoryTool = createTool({
  id: 'change_directory',
  description: 'Change the current working directory for subsequent operations',
  inputSchema: z.object({
    directory: z.string().describe('Path to the directory to change to'),
  }),
  execute: async ({ context: { directory } }) => {
    try {
      const previousDirectory = process.cwd();
      const absolutePath = path.resolve(directory);
      
      // Verify directory exists
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: 'Path is not a directory',
          path: absolutePath,
        };
      }

      // Change working directory
      process.chdir(absolutePath);
      
      return {
        success: true,
        previousDirectory,
        currentDirectory: absolutePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: directory,
      };
    }
  },
});

export const getCurrentDirectoryTool = createTool({
  id: 'get_current_directory',
  description: 'Get the current working directory',
  inputSchema: z.object({}),
  execute: async () => {
    return {
      success: true,
      currentDirectory: process.cwd(),
    };
  },
});

export const gitCloneTool = createTool({
  id: 'git_clone',
  description: 'Clone a git repository to a specified directory',
  inputSchema: z.object({
    repositoryUrl: z.string().describe('Git repository URL to clone'),
    targetDirectory: z.string().describe('Directory to clone into'),
    branch: z.string().optional().describe('Specific branch to clone'),
  }),
  execute: async ({ context: { repositoryUrl, targetDirectory, branch } }) => {
    try {
      const absolutePath = path.resolve(targetDirectory);
      
      // Ensure parent directory exists
      const parentDir = path.dirname(absolutePath);
      await fs.mkdir(parentDir, { recursive: true });
      
      let command = `git clone ${repositoryUrl} ${absolutePath}`;
      if (branch) {
        command += ` -b ${branch}`;
      }
      
      const { stdout, stderr } = await execAsync(command);
      
      return {
        success: true,
        command,
        repositoryUrl,
        targetDirectory: absolutePath,
        branch,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error) {
      return {
        success: false,
        command: `git clone ${repositoryUrl} ${targetDirectory}`,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

export const gitCheckoutTool = createTool({
  id: 'git_checkout',
  description: 'Checkout a git branch or create a new branch',
  inputSchema: z.object({
    branchName: z.string().describe('Branch name to checkout or create'),
    createNew: z.boolean().optional().default(false).describe('Create new branch if it doesn\'t exist'),
    workingDirectory: z.string().optional().describe('Git repository directory (defaults to current)'),
  }),
  execute: async ({ context: { branchName, createNew, workingDirectory } }) => {
    try {
      const originalCwd = process.cwd();
      
      if (workingDirectory) {
        process.chdir(path.resolve(workingDirectory));
      }
      
      let command = `git checkout`;
      if (createNew) {
        command += ` -b`;
      }
      command += ` ${branchName}`;
      
      const { stdout, stderr } = await execAsync(command);
      
      // Restore original directory
      if (workingDirectory) {
        process.chdir(originalCwd);
      }
      
      return {
        success: true,
        command,
        branchName,
        currentDirectory: workingDirectory || originalCwd,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error) {
      return {
        success: false,
        command: `git checkout ${createNew ? '-b ' : ''}${branchName}`,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

export const gitStatusTool = createTool({
  id: 'git_status',
  description: 'Get git status of the current repository',
  inputSchema: z.object({
    workingDirectory: z.string().optional().describe('Git repository directory (defaults to current)'),
  }),
  execute: async ({ context: { workingDirectory } }) => {
    try {
      const originalCwd = process.cwd();
      
      if (workingDirectory) {
        process.chdir(path.resolve(workingDirectory));
      }
      
      const { stdout, stderr } = await execAsync('git status --porcelain');
      
      // Also get branch info
      const { stdout: branchInfo } = await execAsync('git branch --show-current');
      
      // Restore original directory
      if (workingDirectory) {
        process.chdir(originalCwd);
      }
      
      return {
        success: true,
        currentDirectory: workingDirectory || originalCwd,
        currentBranch: branchInfo.trim(),
        statusOutput: stdout.trim(),
        changes: stdout.trim().split('\n').filter(line => line.trim()),
        stderr: stderr.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

export const gitCommitTool = createTool({
  id: 'git_commit',
  description: 'Create a git commit with specified message',
  inputSchema: z.object({
    message: z.string().describe('Commit message'),
    addAll: z.boolean().optional().default(false).describe('Add all modified files before committing'),
    workingDirectory: z.string().optional().describe('Git repository directory (defaults to current)'),
  }),
  execute: async ({ context: { message, addAll, workingDirectory } }) => {
    try {
      const originalCwd = process.cwd();
      
      if (workingDirectory) {
        process.chdir(path.resolve(workingDirectory));
      }
      
      if (addAll) {
        await execAsync('git add .');
      }
      
      const { stdout, stderr } = await execAsync(`git commit -m "${message}"`);
      
      // Restore original directory
      if (workingDirectory) {
        process.chdir(originalCwd);
      }
      
      return {
        success: true,
        message,
        currentDirectory: workingDirectory || originalCwd,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error) {
      return {
        success: false,
        command: `git commit -m "${message}"`,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

export const createPullRequestTool = createTool({
  id: 'create_pull_request',
  description: 'Create a pull request using GitHub CLI',
  inputSchema: z.object({
    title: z.string().describe('Pull request title'),
    body: z.string().describe('Pull request description/body'),
    baseBranch: z.string().optional().default('main').describe('Base branch for the PR'),
    workingDirectory: z.string().optional().describe('Git repository directory (defaults to current)'),
  }),
  execute: async ({ context: { title, body, baseBranch, workingDirectory } }) => {
    try {
      const originalCwd = process.cwd();
      
      if (workingDirectory) {
        process.chdir(path.resolve(workingDirectory));
      }
      
      const command = `gh pr create --title "${title}" --body "${body}" --base ${baseBranch}`;
      const { stdout, stderr } = await execAsync(command);
      
      // Restore original directory
      if (workingDirectory) {
        process.chdir(originalCwd);
      }
      
      return {
        success: true,
        title,
        baseBranch,
        currentDirectory: workingDirectory || originalCwd,
        prUrl: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error) {
      return {
        success: false,
        command: `gh pr create --title "${title}" --body "${body}" --base ${baseBranch}`,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

export const enhancedReadFileTool = createTool({
  id: 'read_file_enhanced',
  description: 'Read content from a file with support for different working directories, session tracking, and automatic diagnostics',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to read'),
    workingDirectory: z.string().optional().describe('Working directory context (defaults to current)'),
    includeDiagnostics: z.boolean().optional().default(true).describe('Include automatic diagnostics for code files'),
  }),
  execute: async ({ context: { filePath, workingDirectory, includeDiagnostics } }) => {
    try {
      const basePath = workingDirectory ? path.resolve(workingDirectory) : process.cwd();
      const absolutePath = path.resolve(basePath, filePath);
      const content = await fs.readFile(absolutePath, 'utf8');
      
      // Track read operation
      const sessionTracker = SessionTracker.getInstance();
      const readStats = sessionTracker.recordRead(absolutePath);
      
      // Get file extension for diagnostics
      const ext = path.extname(absolutePath).toLowerCase();
      const isCodeFile = ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
      
      let diagnostics;
      if (includeDiagnostics && isCodeFile) {
        try {
          // Run TypeScript diagnostics
          const compilerOptions: ts.CompilerOptions = {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            allowSyntheticDefaultImports: true,
            jsx: ext.includes('x') ? ts.JsxEmit.React : undefined,
          };
          
          const program = ts.createProgram([absolutePath], compilerOptions);
          const sourceFile = program.getSourceFile(absolutePath);
          
          if (sourceFile) {
            const allDiagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
            
            const tsdiagnostics = allDiagnostics.map(diagnostic => {
              const severity = diagnostic.category === ts.DiagnosticCategory.Error 
                ? DiagnosticSeverity.Error
                : diagnostic.category === ts.DiagnosticCategory.Warning
                ? DiagnosticSeverity.Warning
                : DiagnosticSeverity.Information;
              
              let range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
              
              if (diagnostic.start !== undefined && diagnostic.length !== undefined) {
                const startPos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
                const endPos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);
                range = {
                  start: { line: startPos.line, character: startPos.character },
                  end: { line: endPos.line, character: endPos.character }
                };
              }
              
              return {
                range,
                severity,
                message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                source: 'typescript',
                code: diagnostic.code,
              };
            });

            const errorCount = tsdiagnostics.filter(d => d.severity === DiagnosticSeverity.Error).length;
            const warningCount = tsdiagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).length;

            diagnostics = {
              language: ext.slice(1),
              diagnosticsCount: tsdiagnostics.length,
              errorCount,
              warningCount,
              hasErrors: errorCount > 0,
              hasWarnings: warningCount > 0,
              diagnostics: tsdiagnostics.slice(0, 5), // Limit to first 5 for summary
            };

            // Store diagnostics in session tracker
            sessionTracker.storeDiagnostics(absolutePath, diagnostics);
          }
        } catch (diagnosticError) {
          // Silently fail - diagnostics are optional
          console.warn('Diagnostics failed for', absolutePath, ':', diagnosticError);
        }
      }
      
      return {
        success: true,
        content,
        path: absolutePath,
        relativePath: path.relative(basePath, absolutePath),
        size: Buffer.byteLength(content, 'utf8'),
        workingDirectory: basePath,
        // Session tracking info
        sessionInfo: {
          readCount: readStats.readCount,
          totalOperations: readStats.totalOperations,
          sessionDuration: Math.round(readStats.sessionDuration / 1000), // in seconds
          isFrequentlyAccessed: readStats.readCount > 3,
        },
        // Diagnostics info (if code file)
        ...(diagnostics && { diagnostics }),
        // File type info
        fileInfo: {
          extension: ext,
          isCodeFile,
          language: isCodeFile ? ext.slice(1) : null,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        path: filePath,
        workingDirectory: workingDirectory || process.cwd(),
      };
    }
  },
});

export const enhancedWriteFileTool = createTool({
  id: 'write_file_enhanced',
  description: 'Write content to a file with support for different working directories, duplicate detection, session tracking, and automatic diagnostics',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write to the file'),
    workingDirectory: z.string().optional().describe('Working directory context (defaults to current)'),
    includeDiagnostics: z.boolean().optional().default(true).describe('Include automatic diagnostics for code files after writing'),
  }),
  execute: async ({ context: { filePath, content, workingDirectory, includeDiagnostics } }) => {
    try {
      const basePath = workingDirectory ? path.resolve(workingDirectory) : process.cwd();
      const absolutePath = path.resolve(basePath, filePath);
      
      // Track write operation and check for duplicates BEFORE writing
      const sessionTracker = SessionTracker.getInstance();
      const writeStats = sessionTracker.recordWrite(absolutePath, content);
      
      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write the file
      await fs.writeFile(absolutePath, content, 'utf8');
      
      // Get file extension for diagnostics
      const ext = path.extname(absolutePath).toLowerCase();
      const isCodeFile = ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
      
      let diagnostics;
      if (includeDiagnostics && isCodeFile) {
        try {
          // Run TypeScript diagnostics on the newly written content
          const compilerOptions: ts.CompilerOptions = {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            allowSyntheticDefaultImports: true,
            jsx: ext.includes('x') ? ts.JsxEmit.React : undefined,
          };
          
          const program = ts.createProgram([absolutePath], compilerOptions);
          const sourceFile = program.getSourceFile(absolutePath);
          
          if (sourceFile) {
            const allDiagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
            
            const tsdiagnostics = allDiagnostics.map(diagnostic => {
              const severity = diagnostic.category === ts.DiagnosticCategory.Error 
                ? DiagnosticSeverity.Error
                : diagnostic.category === ts.DiagnosticCategory.Warning
                ? DiagnosticSeverity.Warning
                : DiagnosticSeverity.Information;
              
              let range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
              
              if (diagnostic.start !== undefined && diagnostic.length !== undefined) {
                const startPos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
                const endPos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);
                range = {
                  start: { line: startPos.line, character: startPos.character },
                  end: { line: endPos.line, character: endPos.character }
                };
              }
              
              return {
                range,
                severity,
                message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                source: 'typescript',
                code: diagnostic.code,
              };
            });

            const errorCount = tsdiagnostics.filter(d => d.severity === DiagnosticSeverity.Error).length;
            const warningCount = tsdiagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).length;

            diagnostics = {
              language: ext.slice(1),
              diagnosticsCount: tsdiagnostics.length,
              errorCount,
              warningCount,
              hasErrors: errorCount > 0,
              hasWarnings: warningCount > 0,
              diagnostics: tsdiagnostics.slice(0, 5), // Limit to first 5 for summary
            };

            // Store diagnostics in session tracker
            sessionTracker.storeDiagnostics(absolutePath, diagnostics);
          }
        } catch (diagnosticError) {
          // Silently fail - diagnostics are optional
          console.warn('Post-write diagnostics failed for', absolutePath, ':', diagnosticError);
        }
      }
      
      return {
        success: true,
        path: absolutePath,
        relativePath: path.relative(basePath, absolutePath),
        bytesWritten: Buffer.byteLength(content, 'utf8'),
        workingDirectory: basePath,
        // Session tracking and duplicate detection info
        sessionInfo: {
          writeCount: writeStats.writeCount,
          totalOperations: writeStats.totalOperations,
          sessionDuration: Math.round(writeStats.sessionDuration / 1000), // in seconds
          duplicateDetected: writeStats.duplicateDetected,
          duplicateCount: writeStats.duplicateCount,
          isLikelyLoop: writeStats.isLikelyLoop,
          warning: writeStats.warning,
          isFrequentlyModified: writeStats.writeCount > 5,
        },
        // Diagnostics info (if code file)
        ...(diagnostics && { diagnostics }),
        // File type info
        fileInfo: {
          extension: ext,
          isCodeFile,
          language: isCodeFile ? ext.slice(1) : null,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        path: filePath,
        workingDirectory: workingDirectory || process.cwd(),
      };
    }
  },
});

export const enhancedExecuteShellTool = createTool({
  id: 'execute_shell_enhanced',
  description: 'Execute a shell command with support for different working directories',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute'),
    workingDirectory: z.string().optional().describe('Working directory for the command (defaults to current)'),
    timeout: z.number().optional().default(30000).describe('Command timeout in milliseconds'),
  }),
  execute: async ({ context: { command, workingDirectory, timeout } }) => {
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
        workingDirectory: workingDirectory || process.cwd(),
      };
    }
  },
});

export const findCodeOrFunctionTool = createTool({
  id: 'find_code_or_function',
  description: 'Search for code patterns, functions, or text using ripgrep (rg) with advanced options',
  inputSchema: z.object({
    pattern: z.string().describe('The search pattern (supports regex)'),
    workingDirectory: z.string().optional().describe('Directory to search in (defaults to current)'),
    fileTypes: z.array(z.string()).optional().describe('File extensions to include (e.g., ["ts", "js", "tsx"])'),
    ignoreCase: z.boolean().optional().default(false).describe('Perform case-insensitive search'),
    exactMatch: z.boolean().optional().default(false).describe('Search for exact word matches only'),
    contextLines: z.number().optional().default(2).describe('Number of context lines to show around matches'),
    maxResults: z.number().optional().default(50).describe('Maximum number of results to return'),
    includeHidden: z.boolean().optional().default(false).describe('Include hidden files and directories'),
  }),
  execute: async ({ context: { pattern, workingDirectory, fileTypes, ignoreCase, exactMatch, contextLines, maxResults, includeHidden } }) => {
    try {
      const searchDir = workingDirectory ? path.resolve(workingDirectory) : process.cwd();
      
      // Build ripgrep command args array
      const args = [];
      
      // Add pattern matching options
      if (ignoreCase) args.push('-i');
      if (exactMatch) args.push('-w');
      if (includeHidden) args.push('--hidden');
      
      // Add context lines
      if (contextLines > 0) args.push('-C', contextLines.toString());
      
      // Add file type filters using glob patterns instead of -t
      if (fileTypes && fileTypes.length > 0) {
        const globPatterns = fileTypes.map(ext => `*.${ext}`);
        args.push('-g', `{${globPatterns.join(',')}}`);
      }
      
      // Add max count limit
      args.push('-m', maxResults.toString());
      
      // Add line numbers and file names
      args.push('-n', '--with-filename');
      
      // Add the pattern
      args.push(pattern);
      
      // Add search directory
      args.push(searchDir);
      
      const command = `rg ${args.join(' ')}`;
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 5 * 1024 * 1024, // 5MB buffer
        timeout: 10000, // 10 second timeout
      });
      
      // Parse results
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const results = [];
      let currentFile = '';
      let currentMatches = [];
      
      for (const line of lines) {
        if (line.includes(':')) {
          const parts = line.split(':');
          if (parts.length >= 3) {
            const file = parts[0];
            const lineNum = parseInt(parts[1]);
            const content = parts.slice(2).join(':');
            
            if (file !== currentFile) {
              if (currentFile && currentMatches.length > 0) {
                results.push({
                  file: currentFile,
                  matches: currentMatches,
                });
              }
              currentFile = file;
              currentMatches = [];
            }
            
            currentMatches.push({
              lineNumber: lineNum,
              content: content.trim(),
            });
          }
        }
      }
      
      // Add the last file's matches
      if (currentFile && currentMatches.length > 0) {
        results.push({
          file: currentFile,
          matches: currentMatches,
        });
      }
      
      return {
        success: true,
        command,
        pattern,
        searchDirectory: searchDir,
        totalFiles: results.length,
        totalMatches: results.reduce((sum, file) => sum + file.matches.length, 0),
        results,
        stderr: stderr.trim(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        pattern,
        searchDirectory: workingDirectory || process.cwd(),
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

export const findAndReplaceTool = createTool({
  id: 'find_and_replace',
  description: 'Find and replace text in a single file with backup and validation',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to modify'),
    findPattern: z.string().describe('Text or regex pattern to find'),
    replaceWith: z.string().describe('Text to replace matches with'),
    workingDirectory: z.string().optional().describe('Working directory context (defaults to current)'),
    isRegex: z.boolean().optional().default(false).describe('Treat findPattern as a regular expression'),
    caseSensitive: z.boolean().optional().default(true).describe('Perform case-sensitive search'),
    replaceAll: z.boolean().optional().default(true).describe('Replace all occurrences (false = replace only first)'),
    createBackup: z.boolean().optional().default(true).describe('Create a backup file before modifying'),
    dryRun: z.boolean().optional().default(false).describe('Preview changes without modifying the file'),
  }),
  execute: async ({ context: { filePath, findPattern, replaceWith, workingDirectory, isRegex, caseSensitive, replaceAll, createBackup, dryRun } }) => {
    try {
      const basePath = workingDirectory ? path.resolve(workingDirectory) : process.cwd();
      const absolutePath = path.resolve(basePath, filePath);
      
      // Read the original file
      const originalContent = await fs.readFile(absolutePath, 'utf8');
      
      // Create search pattern
      let searchPattern;
      if (isRegex) {
        const flags = caseSensitive ? 'g' : 'gi';
        searchPattern = new RegExp(findPattern, replaceAll ? flags : flags.replace('g', ''));
      } else {
        // Escape special regex characters for literal search
        const escapedPattern = findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = caseSensitive ? 'g' : 'gi';
        searchPattern = new RegExp(escapedPattern, replaceAll ? flags : flags.replace('g', ''));
      }
      
      // Find matches and their positions
      const matches = [];
      let match;
      const globalPattern = new RegExp(searchPattern.source, searchPattern.flags.includes('g') ? searchPattern.flags : searchPattern.flags + 'g');
      
      while ((match = globalPattern.exec(originalContent)) !== null) {
        const lineNumber = originalContent.substring(0, match.index).split('\n').length;
        const lineStart = originalContent.lastIndexOf('\n', match.index) + 1;
        const lineEnd = originalContent.indexOf('\n', match.index);
        const lineContent = originalContent.substring(lineStart, lineEnd === -1 ? originalContent.length : lineEnd);
        
        matches.push({
          match: match[0],
          index: match.index,
          lineNumber,
          lineContent,
          column: match.index - lineStart + 1,
        });
        
        if (!replaceAll) break;
      }
      
      if (matches.length === 0) {
        return {
          success: true,
          filePath: absolutePath,
          relativePath: path.relative(basePath, absolutePath),
          matchesFound: 0,
          message: 'No matches found for the specified pattern',
          originalContent: dryRun ? originalContent : undefined,
        };
      }
      
      // Perform replacement
      const newContent = originalContent.replace(searchPattern, replaceWith);
      
      if (dryRun) {
        return {
          success: true,
          filePath: absolutePath,
          relativePath: path.relative(basePath, absolutePath),
          matchesFound: matches.length,
          matches,
          originalContent,
          newContent,
          dryRun: true,
          message: `Would replace ${matches.length} occurrence(s)`,
        };
      }
      
      // Create backup if requested
      let backupPath;
      if (createBackup) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = `${absolutePath}.backup.${timestamp}`;
        await fs.writeFile(backupPath, originalContent, 'utf8');
      }
      
      // Write the modified content
      await fs.writeFile(absolutePath, newContent, 'utf8');
      
      return {
        success: true,
        filePath: absolutePath,
        relativePath: path.relative(basePath, absolutePath),
        backupPath,
        matchesFound: matches.length,
        matches,
        bytesWritten: Buffer.byteLength(newContent, 'utf8'),
        originalSize: Buffer.byteLength(originalContent, 'utf8'),
        newSize: Buffer.byteLength(newContent, 'utf8'),
        workingDirectory: basePath,
        message: `Successfully replaced ${matches.length} occurrence(s)`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        filePath,
        workingDirectory: workingDirectory || process.cwd(),
      };
    }
  },
});

export const getSessionSummaryTool = createTool({
  id: 'get_session_summary',
  description: 'Get a summary of the current session including file operations, duplicates, and potential loops',
  inputSchema: z.object({
    includeFileDetails: z.boolean().optional().default(true).describe('Include detailed file operation history'),
  }),
  execute: async ({ context: { includeFileDetails } }) => {
    try {
      const sessionTracker = SessionTracker.getInstance();
      const summary = sessionTracker.getSessionSummary();
      
      // Analyze for potential issues
      const potentialLoops = summary.files.filter(f => 
        f.contentHashes && f.contentHashes.length > 0 && 
        f.writeCount > 2 && 
        f.contentHashes.slice(0, 3).some((hash, i, arr) => 
          arr.slice(i + 1).includes(hash)
        )
      );
      
      const frequentlyModified = summary.files.filter(f => f.writeCount > 5);
      const frequentlyRead = summary.files.filter(f => f.readCount > 10);
      
      return {
        success: true,
        sessionDuration: Math.round(summary.sessionDuration / 1000), // in seconds
        totalFiles: summary.totalFiles,
        totalOperations: summary.totalOperations,
        totalReads: summary.totalReads,
        totalWrites: summary.totalWrites,
        
        // Analysis
        analysis: {
          potentialLoops: potentialLoops.length,
          frequentlyModified: frequentlyModified.length,
          frequentlyRead: frequentlyRead.length,
          averageOperationsPerFile: summary.totalFiles > 0 ? Math.round(summary.totalOperations / summary.totalFiles) : 0,
        },
        
        // Warnings
        warnings: [
          ...(potentialLoops.length > 0 ? [`🔄 ${potentialLoops.length} file(s) may have duplicate content loops`] : []),
          ...(frequentlyModified.length > 0 ? [`⚠️ ${frequentlyModified.length} file(s) modified more than 5 times`] : []),
          ...(frequentlyRead.length > 0 ? [`📖 ${frequentlyRead.length} file(s) read more than 10 times`] : []),
          ...(summary.totalOperations > 100 ? ['🚨 Very high operation count - check for inefficiencies'] : []),
        ],
        
        // Most active files
        mostActiveFiles: summary.files.slice(0, 5).map(f => ({
          file: f.filePath,
          fullPath: includeFileDetails ? f.fullPath : undefined,
          readCount: f.readCount,
          writeCount: f.writeCount,
          totalOps: f.totalOperations,
          lastAccessed: f.lastReadTime || f.lastWriteTime,
        })),
        
        // Detailed file info (if requested)
        ...(includeFileDetails && {
          allFiles: summary.files.map(f => ({
            file: f.filePath,
            fullPath: f.fullPath,
            readCount: f.readCount,
            writeCount: f.writeCount,
            totalOperations: f.totalOperations,
            hasContentHistory: f.contentHashes && f.contentHashes.length > 0,
            contentVersions: f.contentHashes ? f.contentHashes.length : 0,
            lastAccessed: f.lastReadTime || f.lastWriteTime,
          })),
        }),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

// LSP and Tree-sitter Tools

export const getCodeDiagnosticsTool = createTool({
  id: 'get_code_diagnostics',
  description: 'Get TypeScript/JavaScript diagnostics for a file using LSP',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to analyze'),
    workingDirectory: z.string().optional().describe('Working directory context (defaults to current)'),
    includeWarnings: z.boolean().optional().default(true).describe('Include warning diagnostics'),
    includeSuggestions: z.boolean().optional().default(false).describe('Include suggestion diagnostics'),
  }),
  execute: async ({ context: { filePath, workingDirectory, includeWarnings, includeSuggestions } }) => {
    try {
      const originalCwd = process.cwd();
      const basePath = workingDirectory ? path.resolve(workingDirectory) : originalCwd;
      const absolutePath = path.resolve(basePath, filePath);
      
      // Check if file exists
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        return {
          success: false,
          error: 'Path is not a file',
          filePath: absolutePath,
        };
      }
      
      // Read file content
      const content = await fs.readFile(absolutePath, 'utf-8');
      const ext = path.extname(absolutePath).toLowerCase();
      
      let diagnostics: Diagnostic[] = [];
      
      if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
        // TypeScript diagnostics
        const compilerOptions: ts.CompilerOptions = {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          moduleResolution: ts.ModuleResolutionKind.NodeJs,
          allowSyntheticDefaultImports: true,
          jsx: ext.includes('x') ? ts.JsxEmit.React : undefined,
        };
        
        // Create program
        const program = ts.createProgram([absolutePath], compilerOptions);
        const sourceFile = program.getSourceFile(absolutePath);
        
        if (sourceFile) {
          const allDiagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
          
          diagnostics = allDiagnostics.map(diagnostic => {
            const severity = diagnostic.category === ts.DiagnosticCategory.Error 
              ? DiagnosticSeverity.Error
              : diagnostic.category === ts.DiagnosticCategory.Warning
              ? DiagnosticSeverity.Warning
              : DiagnosticSeverity.Information;
            
            let range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
            
            if (diagnostic.start !== undefined && diagnostic.length !== undefined) {
              const startPos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
              const endPos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);
              range = {
                start: { line: startPos.line, character: startPos.character },
                end: { line: endPos.line, character: endPos.character }
              };
            }
            
            return {
              range,
              severity,
              message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
              source: 'typescript',
              code: diagnostic.code,
            };
          }).filter(d => {
            if (d.severity === DiagnosticSeverity.Error) return true;
            if (d.severity === DiagnosticSeverity.Warning && includeWarnings) return true;
            if (d.severity === DiagnosticSeverity.Information && includeSuggestions) return true;
            return false;
          });
        }
      }
      
      return {
        success: true,
        filePath: absolutePath,
        relativePath: path.relative(basePath, absolutePath),
        language: ext.slice(1),
        diagnosticsCount: diagnostics.length,
        errorCount: diagnostics.filter(d => d.severity === DiagnosticSeverity.Error).length,
        warningCount: diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).length,
        diagnostics,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        filePath,
        workingDirectory: workingDirectory || process.cwd(),
      };
    }
  },
});

export const parseCodeASTTool = createTool({
  id: 'parse_code_ast',
  description: 'Parse code into AST using Tree-sitter for advanced code analysis',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to parse'),
    workingDirectory: z.string().optional().describe('Working directory context (defaults to current)'),
    query: z.string().optional().describe('Tree-sitter query to run on the AST'),
    includeText: z.boolean().optional().default(false).describe('Include source text in node results'),
    maxDepth: z.number().optional().default(3).describe('Maximum depth to traverse AST'),
  }),
  execute: async ({ context: { filePath, workingDirectory, query, includeText, maxDepth } }) => {
    try {
      const originalCwd = process.cwd();
      const basePath = workingDirectory ? path.resolve(workingDirectory) : originalCwd;
      const absolutePath = path.resolve(basePath, filePath);
      
      // Check if file exists
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        return {
          success: false,
          error: 'Path is not a file',
          filePath: absolutePath,
        };
      }
      
      // Read file content
      const content = await fs.readFile(absolutePath, 'utf-8');
      const ext = path.extname(absolutePath).toLowerCase();
      
      // Initialize parser with appropriate language
      const parser = new Parser();
      let language;
      
      switch (ext) {
        case '.js':
        case '.jsx':
          language = JavaScript;
          break;
        case '.ts':
          language = TypeScript.typescript;
          break;
        case '.tsx':
          language = TypeScript.tsx;
          break;
        case '.py':
          language = Python;
          break;
        default:
          return {
            success: false,
            error: `Unsupported file type: ${ext}`,
            filePath: absolutePath,
            supportedTypes: ['.js', '.jsx', '.ts', '.tsx', '.py'],
          };
      }
      
      parser.setLanguage(language);
      const tree = parser.parse(content);
      
      // Helper function to serialize AST node
      function serializeNode(node: any, depth = 0): any {
        if (depth > maxDepth) {
          return {
            type: node.type,
            isNamed: node.isNamed,
            truncated: true,
          };
        }
        
        const result: any = {
          type: node.type,
          isNamed: node.isNamed,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
          childCount: node.childCount,
        };
        
        if (includeText && node.text.length < 200) {
          result.text = node.text;
        }
        
        if (node.children && node.children.length > 0) {
          result.children = node.children.map((child: any) => serializeNode(child, depth + 1));
        }
        
        return result;
      }
      
      let queryResults;
      if (query) {
        try {
          const queryObj = language.query(query);
          const captures = queryObj.captures(tree.rootNode);
          queryResults = captures.map((capture: any) => ({
            name: capture.name,
            node: serializeNode(capture.node, 0),
            text: includeText ? capture.node.text : undefined,
          }));
        } catch (queryError: any) {
          return {
            success: false,
            error: `Query error: ${queryError.message}`,
            filePath: absolutePath,
          };
        }
      }
      
      return {
        success: true,
        filePath: absolutePath,
        relativePath: path.relative(basePath, absolutePath),
        language: ext.slice(1),
        ast: serializeNode(tree.rootNode),
        hasErrors: tree.rootNode.hasError(),
        queryResults,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        filePath,
        workingDirectory: workingDirectory || process.cwd(),
      };
    }
  },
});

export const analyzeCodeStructureTool = createTool({
  id: 'analyze_code_structure',
  description: 'Analyze code structure and extract functions, classes, imports using Tree-sitter',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to analyze'),
    workingDirectory: z.string().optional().describe('Working directory context (defaults to current)'),
    includeDetails: z.boolean().optional().default(true).describe('Include detailed information like parameters, types'),
  }),
  execute: async ({ context: { filePath, workingDirectory, includeDetails } }) => {
    try {
      const originalCwd = process.cwd();
      const basePath = workingDirectory ? path.resolve(workingDirectory) : originalCwd;
      const absolutePath = path.resolve(basePath, filePath);
      
      // Check if file exists
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        return {
          success: false,
          error: 'Path is not a file',
          filePath: absolutePath,
        };
      }
      
      // Read file content
      const content = await fs.readFile(absolutePath, 'utf-8');
      const ext = path.extname(absolutePath).toLowerCase();
      
      // Initialize parser
      const parser = new Parser();
      let language;
      
      switch (ext) {
        case '.js':
        case '.jsx':
          language = JavaScript;
          break;
        case '.ts':
          language = TypeScript.typescript;
          break;
        case '.tsx':
          language = TypeScript.tsx;
          break;
        case '.py':
          language = Python;
          break;
        default:
          return {
            success: false,
            error: `Unsupported file type: ${ext}`,
            filePath: absolutePath,
            supportedTypes: ['.js', '.jsx', '.ts', '.tsx', '.py'],
          };
      }
      
      parser.setLanguage(language);
      const tree = parser.parse(content);
      
      const structure = {
        imports: [] as any[],
        exports: [] as any[],
        functions: [] as any[],
        classes: [] as any[],
        variables: [] as any[],
        types: [] as any[],
      };
      
      // Helper to extract text from node
      function getNodeText(node: any): string {
        return content.slice(node.startIndex, node.endIndex);
      }
      
      // Helper to get line/column from position
      function getPosition(index: number) {
        const lines = content.slice(0, index).split('\n');
        return {
          line: lines.length - 1,
          column: lines[lines.length - 1].length,
        };
      }
      
      // Walk the AST and extract structure
      function walkNode(node: any) {
        switch (node.type) {
          case 'import_statement':
          case 'import_declaration':
            structure.imports.push({
              type: 'import',
              text: getNodeText(node),
              position: getPosition(node.startIndex),
              ...(includeDetails && { raw: getNodeText(node) }),
            });
            break;
            
          case 'export_statement':
          case 'export_declaration':
            structure.exports.push({
              type: 'export',
              text: getNodeText(node),
              position: getPosition(node.startIndex),
              ...(includeDetails && { raw: getNodeText(node) }),
            });
            break;
            
          case 'function_declaration':
          case 'function_definition':
          case 'method_definition':
            const funcName = node.children?.find((c: any) => c.type === 'identifier')?.text || 'anonymous';
            structure.functions.push({
              type: 'function',
              name: funcName,
              position: getPosition(node.startIndex),
              ...(includeDetails && { 
                text: getNodeText(node),
                signature: getNodeText(node).split('{')[0]?.trim() + '{...}',
              }),
            });
            break;
            
          case 'class_declaration':
          case 'class_definition':
            const className = node.children?.find((c: any) => c.type === 'identifier')?.text || 'anonymous';
            structure.classes.push({
              type: 'class',
              name: className,
              position: getPosition(node.startIndex),
              ...(includeDetails && { 
                text: getNodeText(node).split('{')[0]?.trim() + '{...}',
              }),
            });
            break;
            
          case 'variable_declaration':
          case 'lexical_declaration':
            const varName = node.children?.find((c: any) => c.type === 'variable_declarator')
              ?.children?.find((c: any) => c.type === 'identifier')?.text || 'unknown';
            structure.variables.push({
              type: 'variable',
              name: varName,
              position: getPosition(node.startIndex),
              ...(includeDetails && { text: getNodeText(node) }),
            });
            break;
            
          case 'type_alias_declaration':
          case 'interface_declaration':
            const typeName = node.children?.find((c: any) => c.type === 'type_identifier')?.text || 'unknown';
            structure.types.push({
              type: node.type.includes('interface') ? 'interface' : 'type',
              name: typeName,
              position: getPosition(node.startIndex),
              ...(includeDetails && { text: getNodeText(node) }),
            });
            break;
        }
        
        // Recursively walk children
        if (node.children) {
          for (const child of node.children) {
            walkNode(child);
          }
        }
      }
      
      walkNode(tree.rootNode);
      
      return {
        success: true,
        filePath: absolutePath,
        relativePath: path.relative(basePath, absolutePath),
        language: ext.slice(1),
        hasErrors: tree.rootNode.hasError(),
        structure,
        summary: {
          totalImports: structure.imports.length,
          totalExports: structure.exports.length,
          totalFunctions: structure.functions.length,
          totalClasses: structure.classes.length,
          totalVariables: structure.variables.length,
          totalTypes: structure.types.length,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        filePath,
        workingDirectory: workingDirectory || process.cwd(),
      };
    }
  },
});

// Enhanced MCP Server
export const enhancedCoderMCPServer = new MCPServer({
  name: 'Enhanced Coder MCP Server',
  version: '1.0.0',
  description: 'Enhanced MCP server with directory navigation and git operations for coder agents',
  tools: {
    changeDirectory: changeDirectoryTool,
    getCurrentDirectory: getCurrentDirectoryTool,
    gitClone: gitCloneTool,
    gitCheckout: gitCheckoutTool,
    gitStatus: gitStatusTool,
    gitCommit: gitCommitTool,
    createPullRequest: createPullRequestTool,
    readFileEnhanced: enhancedReadFileTool,
    writeFileEnhanced: enhancedWriteFileTool,
    executeShellEnhanced: enhancedExecuteShellTool,
    findCodeOrFunction: findCodeOrFunctionTool,
    findAndReplace: findAndReplaceTool,
    getCodeDiagnostics: getCodeDiagnosticsTool,
    parseCodeAST: parseCodeASTTool,
    analyzeCodeStructure: analyzeCodeStructureTool,
    getSessionSummary: getSessionSummaryTool,
  },
});

// Helper function to start the server
export async function startEnhancedCoderMCPServer() {
  console.log('Starting Enhanced Coder MCP Server...');
  await enhancedCoderMCPServer.startStdio();
}

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  startEnhancedCoderMCPServer().catch(console.error);
}