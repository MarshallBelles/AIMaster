/**
 * Specialized tools for the Personal Assistant Agent
 * Delegation, task management, and basic information gathering
 */

import { createTool } from '@mastra/core';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Basic file reading for the assistant (read-only access)
export const readFileTool = createTool({
  id: 'read_file',
  description: 'Read content from a file for analysis and decision making',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file to read'),
    maxLines: z.number().optional().describe('Maximum number of lines to read (for large files)'),
  }),
  execute: async ({ filePath, maxLines }) => {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, 'utf8');
      
      let processedContent = content;
      if (maxLines && maxLines > 0) {
        const lines = content.split('\n');
        processedContent = lines.slice(0, maxLines).join('\n');
      }
      
      return {
        success: true,
        content: processedContent,
        path: absolutePath,
        size: Buffer.byteLength(content, 'utf8'),
        truncated: maxLines ? content.split('\n').length > maxLines : false,
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

// Agent delegation tool
export const delegateToAgentTool = createTool({
  id: 'delegate_to_agent',
  description: 'Delegate a task to a specialized agent',
  inputSchema: z.object({
    agentName: z.enum(['coder']).describe('Name of the agent to delegate to'),
    task: z.string().describe('The task to delegate'),
    context: z.string().optional().describe('Additional context for the task'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  }),
  execute: async ({ agentName, task, context, priority = 'medium' }) => {
    try {
      // In a real implementation, this would communicate with other agents
      // For now, we'll return a structured response that can be handled by the system
      
      console.log(`[Personal Assistant] Delegating to ${agentName}: ${task.substring(0, 100)}...`);
      
      return {
        success: true,
        delegatedTo: agentName,
        task,
        context,
        priority,
        status: 'delegated',
        timestamp: new Date().toISOString(),
        delegationId: `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        agentName,
        task,
      };
    }
  },
});

// Task analysis tool
export const analyzeTaskTool = createTool({
  id: 'analyze_task',
  description: 'Analyze a task to determine the best approach and required agents',
  inputSchema: z.object({
    task: z.string().describe('The task to analyze'),
    availableAgents: z.array(z.string()).optional().default(['coder']).describe('List of available agents'),
  }),
  execute: async ({ task, availableAgents = ['coder'] }) => {
    try {
      // Simple task categorization logic
      const taskLower = task.toLowerCase();
      
      let recommendedAgent = 'personal-assistant'; // Default to handling it ourselves
      let taskType = 'general';
      let confidence = 0.5;
      
      // Code-related keywords
      const codeKeywords = [
        'code', 'programming', 'function', 'class', 'variable', 'debug', 'error',
        'javascript', 'typescript', 'python', 'java', 'css', 'html', 'react',
        'node', 'npm', 'git', 'repository', 'commit', 'pull request', 'merge',
        'test', 'unittest', 'integration', 'deployment', 'build', 'compile',
        'refactor', 'optimize', 'fix', 'bug', 'feature', 'implement'
      ];
      
      const codeMatches = codeKeywords.filter(keyword => taskLower.includes(keyword));
      
      if (codeMatches.length > 0 && availableAgents.includes('coder')) {
        recommendedAgent = 'coder';
        taskType = 'coding';
        confidence = Math.min(0.9, 0.5 + (codeMatches.length * 0.1));
      }
      
      // File operation keywords
      const fileKeywords = ['file', 'directory', 'folder', 'create', 'delete', 'move', 'copy', 'read', 'write'];
      const fileMatches = fileKeywords.filter(keyword => taskLower.includes(keyword));
      
      if (fileMatches.length > 0 && codeMatches.length === 0) {
        if (taskLower.includes('read') || taskLower.includes('analyze')) {
          recommendedAgent = 'personal-assistant';
          taskType = 'analysis';
        } else if (availableAgents.includes('coder')) {
          recommendedAgent = 'coder';
          taskType = 'file-operations';
          confidence = 0.7;
        }
      }
      
      return {
        success: true,
        task,
        analysis: {
          taskType,
          recommendedAgent,
          confidence,
          reasoning: `Detected ${codeMatches.length} code-related keywords and ${fileMatches.length} file-related keywords`,
          keywords: {
            code: codeMatches,
            file: fileMatches,
          },
        },
        availableAgents,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        task,
      };
    }
  },
});

// Task planning tool
export const createTaskPlanTool = createTool({
  id: 'create_task_plan',
  description: 'Break down a complex task into smaller, manageable steps',
  inputSchema: z.object({
    task: z.string().describe('The complex task to break down'),
    maxSteps: z.number().optional().default(10).describe('Maximum number of steps to create'),
  }),
  execute: async ({ task, maxSteps = 10 }) => {
    try {
      // This is a simplified planning algorithm
      // In a real implementation, this might use more sophisticated planning
      
      const steps = [];
      const taskLower = task.toLowerCase();
      
      // Common step patterns based on task type
      if (taskLower.includes('code') || taskLower.includes('implement') || taskLower.includes('develop')) {
        steps.push(
          { step: 1, action: 'Analyze requirements and specifications', agent: 'personal-assistant' },
          { step: 2, action: 'Review existing codebase and architecture', agent: 'coder' },
          { step: 3, action: 'Design solution approach', agent: 'coder' },
          { step: 4, action: 'Implement core functionality', agent: 'coder' },
          { step: 5, action: 'Add error handling and validation', agent: 'coder' },
          { step: 6, action: 'Write tests', agent: 'coder' },
          { step: 7, action: 'Run tests and fix issues', agent: 'coder' },
          { step: 8, action: 'Review and finalize implementation', agent: 'personal-assistant' },
        );
      } else if (taskLower.includes('file') || taskLower.includes('organize')) {
        steps.push(
          { step: 1, action: 'Analyze current file structure', agent: 'coder' },
          { step: 2, action: 'Plan organization strategy', agent: 'personal-assistant' },
          { step: 3, action: 'Execute file operations', agent: 'coder' },
          { step: 4, action: 'Verify results', agent: 'personal-assistant' },
        );
      } else {
        // Generic task breakdown
        steps.push(
          { step: 1, action: 'Understand task requirements', agent: 'personal-assistant' },
          { step: 2, action: 'Gather necessary information', agent: 'personal-assistant' },
          { step: 3, action: 'Execute main task', agent: 'coder' },
          { step: 4, action: 'Review and validate results', agent: 'personal-assistant' },
        );
      }
      
      // Limit to maxSteps
      const limitedSteps = steps.slice(0, maxSteps);
      
      return {
        success: true,
        task,
        plan: {
          totalSteps: limitedSteps.length,
          steps: limitedSteps,
          estimatedDuration: `${limitedSteps.length * 5}-${limitedSteps.length * 15} minutes`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        task,
      };
    }
  },
});

// List directory tool (read-only for assistant)
export const listDirectoryTool = createTool({
  id: 'list_directory',
  description: 'List contents of a directory for analysis',
  inputSchema: z.object({
    directoryPath: z.string().describe('Path to the directory to list'),
    maxItems: z.number().optional().default(50).describe('Maximum number of items to return'),
  }),
  execute: async ({ directoryPath, maxItems = 50 }) => {
    try {
      const absolutePath = path.resolve(directoryPath);
      const entries = await fs.readdir(absolutePath);
      
      // Get basic info for each entry (limited to maxItems)
      const limitedEntries = entries.slice(0, maxItems);
      const detailedEntries = [];
      
      for (const entry of limitedEntries) {
        try {
          const entryPath = path.join(absolutePath, entry);
          const stats = await fs.stat(entryPath);
          detailedEntries.push({
            name: entry,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
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
        totalCount: entries.length,
        shownCount: detailedEntries.length,
        truncated: entries.length > maxItems,
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

// Export all assistant tools
export const assistantTools = [
  readFileTool,
  delegateToAgentTool,
  analyzeTaskTool,
  createTaskPlanTool,
  listDirectoryTool,
];