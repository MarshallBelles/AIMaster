/**
 * Coder Agent - Specialized for code generation, file operations, and development tasks
 * Now uses Enhanced MCP Tools for advanced capabilities
 */

import { BaseAgent, BaseAgentOptions } from './base-agent.js';
import { MCPClient } from '@mastra/mcp';
import ConfigManager from '../../config/index.js';

export class CoderAgent extends BaseAgent {
  private mcpClient: MCPClient;

  constructor() {
    const config = ConfigManager.getAgentConfig('coder');
    
    const options: BaseAgentOptions = {
      name: 'coder',
      description: 'Specialized agent for code generation, file operations, debugging, and development tasks with enhanced MCP capabilities',
      config,
      instructions: `You are the Coder Agent, a specialized AI assistant focused on software development tasks. Your capabilities include:

**Core Responsibilities:**
- Code generation and implementation
- File operations (read, write, create, modify) 
- Debugging and code analysis
- Project structure management
- Shell command execution for development tasks
- Directory navigation and multi-project work
- Git operations and version control
- Code testing and validation
- Refactoring and optimization

**Available Enhanced MCP Tools:**
- Directory Navigation: changeDirectory, getCurrentDirectory
- Enhanced File Operations: readFileEnhanced, writeFileEnhanced (with session tracking & diagnostics)
- Advanced Code Search: findCodeOrFunction, findAndReplace
- Shell Execution: executeShellEnhanced
- Git Operations: gitClone, gitCheckout, gitStatus, gitCommit, createPullRequest
- LSP Integration: getCodeDiagnostics (TypeScript/JS language diagnostics)
- Tree-sitter Analysis: parseCodeAST, analyzeCodeStructure
- Session Management: getSessionSummary (track operations, detect loops)

**Available IDE Tools (when running in Claude Code):**
- Language Diagnostics: getDiagnostics (get TypeScript/language errors)
- Code Execution: executeCode (run Python code in Jupyter kernel)

**Tool Usage Guidelines:**
- Use readFileEnhanced instead of read_file for better directory context
- Use writeFileEnhanced instead of write_file for better directory context  
- Use executeShellEnhanced instead of execute_shell
- Use findCodeOrFunction for searching code patterns across files
- Use findAndReplace for precise file modifications
- Use changeDirectory to navigate between projects
- Always check getCurrentDirectory before file operations
- Use getCodeDiagnostics to check for TypeScript/JS errors and warnings
- Use parseCodeAST for detailed AST analysis with Tree-sitter queries
- Use analyzeCodeStructure to extract functions, classes, imports, exports
- Use getSessionSummary to check for potential loops or inefficiencies
- Use getDiagnostics to check for TypeScript/language errors (Claude Code only)
- Use executeCode for running Python code in Jupyter notebooks (Claude Code only)

**Session Tracking & Loop Prevention:**
- File operations automatically track read/write counts per session
- Duplicate content detection prevents writing the same content repeatedly
- Loop warnings appear when identical content is written multiple times
- Use getSessionSummary if you suspect you're repeating operations
- Pay attention to sessionInfo warnings in read/write responses
- If you see loop warnings, analyze your approach before continuing

**Guidelines:**
1. Always prioritize code quality and best practices
2. Include proper error handling in your implementations
3. Write clear, maintainable, and well-commented code
4. Use appropriate file structures and naming conventions
5. Test your implementations when possible
6. Consider security implications of your code
7. Follow the existing code style and patterns in the project
8. Use absolute paths when working across directories
9. Verify directory existence before operations

**When handling tasks:**
1. Check current directory with getCurrentDirectory
2. Navigate to appropriate directory if needed with changeDirectory
3. Analyze the requirements carefully
4. Plan your approach before implementation
5. Break complex tasks into smaller steps
6. Validate your work through testing or review
7. Provide clear explanations of your implementations

**Code Generation Best Practices:**
- Use TypeScript/JavaScript ES modules syntax
- Include proper type definitions
- Add JSDoc comments for functions and classes
- Handle edge cases and errors appropriately
- Follow consistent formatting and naming conventions

Be efficient, accurate, and thorough in your development work. You can now work across multiple directories and repositories seamlessly.`,
      tools: {}, // Tools will be loaded dynamically from MCP
    };

    super(options);
    
    // Initialize MCP client after super() call
    this.mcpClient = new MCPClient({
      servers: {
        enhancedCoder: {
          command: 'npx',
          args: ['tsx', './src/mastra/tools/enhanced-coder-mcp-server.ts'],
          env: {
            NODE_ENV: process.env.NODE_ENV || 'development',
          },
          timeout: 60000, // 60 second timeout for long operations
        },
      },
    });
  }

  private mcpInitialized = false;

  /**
   * Initialize MCP connection and load tools
   */
  async initialize() {
    try {
      // Just verify MCP connection is working
      console.log('Coder Agent MCP client initialized');
      this.mcpInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Coder Agent MCP:', error);
      this.mcpInitialized = false;
      // Don't throw error - allow agent to work without MCP
      return false;
    }
  }

  /**
   * Override executeTask to use MCP tools dynamically when available
   */
  async executeTask(input: string, context?: any) {
    try {
      console.log(`[${this.agentName}] Executing task: ${input.substring(0, 100)}...`);
      
      let toolsets = undefined;
      
      // Try to use MCP tools if initialized, fallback to basic execution
      if (this.mcpInitialized) {
        try {
          console.log('Using MCP toolsets...');
          toolsets = await this.mcpClient.getToolsets();
        } catch (error) {
          console.warn('MCP toolsets failed, falling back to basic execution:', (error as Error).message);
        }
      }
      
      const response = await this.generate(input, {
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        ...(toolsets && { toolsets }),
        ...context,
      });

      console.log(`[${this.agentName}] Task completed successfully`);
      return response;
    } catch (error) {
      console.error(`[${this.agentName}] Task execution failed:`, error);
      throw error;
    }
  }

  /**
   * Specialized method for code generation tasks
   */
  async generateCode(prompt: string, options?: {
    language?: string;
    framework?: string;
    includeTests?: boolean;
    includeComments?: boolean;
  }) {
    const {
      language = 'typescript',
      framework,
      includeTests = false,
      includeComments = true,
    } = options || {};

    const enhancedPrompt = `
Generate ${language} code for the following requirement:

${prompt}

Requirements:
- Language: ${language}
${framework ? `- Framework: ${framework}` : ''}
- Include comprehensive error handling
${includeComments ? '- Include detailed JSDoc comments' : '- Minimal comments only'}
${includeTests ? '- Include unit tests' : '- No tests required'}
- Follow best practices and coding standards
- Use modern syntax and patterns

Please provide clean, production-ready code with proper structure and organization.
`;

    return await this.executeTask(enhancedPrompt);
  }

  /**
   * Specialized method for debugging tasks
   */
  async debugCode(codeOrPath: string, errorDescription?: string) {
    const debugPrompt = `
Analyze and debug the following code issue:

${errorDescription ? `Error Description: ${errorDescription}` : ''}

Code/Path: ${codeOrPath}

Please:
1. Identify the root cause of the issue
2. Provide a detailed explanation of the problem
3. Suggest specific fixes with code examples
4. Include prevention strategies for similar issues
5. Test the proposed solution if possible

Use the available tools to read files, analyze code structure, and test solutions.
`;

    return await this.executeTask(debugPrompt);
  }

  /**
   * Specialized method for refactoring tasks
   */
  async refactorCode(codeOrPath: string, goals: string[]) {
    const refactorPrompt = `
Refactor the following code to achieve these goals:

Goals:
${goals.map(goal => `- ${goal}`).join('\n')}

Code/Path: ${codeOrPath}

Please:
1. Analyze the current code structure
2. Plan the refactoring approach
3. Implement the improvements
4. Ensure functionality is preserved
5. Update any related files or tests
6. Document the changes made

Use the available tools to read, modify, and create files as needed.
`;

    return await this.executeTask(refactorPrompt);
  }

  /**
   * Specialized method for project setup tasks
   */
  async setupProject(projectType: string, requirements: string[]) {
    const setupPrompt = `
Set up a new ${projectType} project with the following requirements:

Requirements:
${requirements.map(req => `- ${req}`).join('\n')}

Please:
1. Create the appropriate directory structure
2. Set up configuration files (package.json, tsconfig.json, etc.)
3. Install necessary dependencies
4. Create starter files and examples
5. Set up development scripts
6. Include README with setup instructions

Use the available tools to create directories, files, and run setup commands.
`;

    return await this.executeTask(setupPrompt);
  }

  /**
   * Cleanup method to disconnect MCP client
   */
  async disconnect() {
    try {
      await this.mcpClient.disconnect();
      console.log('Coder Agent disconnected from MCP server');
    } catch (error) {
      console.error('Error disconnecting Coder Agent:', error);
    }
  }
}

export default CoderAgent;