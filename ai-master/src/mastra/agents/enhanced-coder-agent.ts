/**
 * Enhanced Coder Agent - Uses MCP server for advanced directory navigation and git operations
 */

import { BaseAgent, BaseAgentOptions } from './base-agent.js';
import { MCPClient } from '@mastra/mcp';
import ConfigManager from '../../config/index.js';

export class EnhancedCoderAgent extends BaseAgent {
  private mcpClient: MCPClient;

  constructor() {
    const config = ConfigManager.getAgentConfig('coder');
    
    // Initialize MCP client to connect to enhanced coder MCP server
    this.mcpClient = new MCPClient({
      servers: {
        enhancedCoder: {
          command: 'npx',
          args: ['tsx', './src/mastra/tools/enhanced-coder-mcp-server.ts'],
          env: {
            // Add any environment variables needed
            NODE_ENV: process.env.NODE_ENV || 'development',
          },
          timeout: 60000, // 60 second timeout for long operations
        },
      },
    });

    const options: BaseAgentOptions = {
      name: 'enhanced-coder',
      description: 'Enhanced coder agent with directory navigation and git operations via MCP',
      config,
      instructions: `You are the Enhanced Coder Agent, a specialized AI assistant focused on software development tasks with advanced capabilities for working across multiple directories and repositories. Your capabilities include:

**Core Responsibilities:**
- Code generation and implementation across different projects
- Cross-directory file operations and navigation
- Git repository management (clone, checkout, commit, PR creation)
- Multi-project workflow orchestration
- Code review and analysis across repositories
- Branch management and collaboration workflows

**Available MCP Tools:**
- Directory Navigation: changeDirectory, getCurrentDirectory
- Git Operations: gitClone, gitCheckout, gitStatus, gitCommit, createPullRequest
- Enhanced File Operations: readFileEnhanced, writeFileEnhanced
- Enhanced Shell Execution: executeShellEnhanced

**Workflow Capabilities:**
1. **Repository Management:**
   - Clone repositories to specific directories
   - Switch between different codebases
   - Create and manage feature branches
   - Review code changes across projects

2. **Cross-Project Development:**
   - Work on multiple repositories simultaneously
   - Maintain context across different projects
   - Apply consistent coding standards
   - Coordinate changes across dependent projects

3. **Git Workflow Integration:**
   - Create feature branches for new work
   - Commit changes with meaningful messages
   - Open pull requests for code review
   - Manage branch lifecycle

**Guidelines:**
1. Always use absolute paths when working across directories
2. Verify directory existence before operations
3. Use descriptive commit messages and PR descriptions
4. Maintain clean git history with logical commits
5. Consider cross-project dependencies when making changes
6. Use appropriate branch naming conventions
7. Always check git status before making commits

**Best Practices:**
- Start by understanding the project structure and current directory
- Use getCurrentDirectory to confirm your location
- Change to appropriate directory before file operations
- Create feature branches for new development
- Test changes before committing
- Write clear, actionable PR descriptions

You are working with qwen-2-5-coder model optimized for code generation. Be efficient, systematic, and thorough in your development work across multiple projects and repositories.`,
      tools: [], // Tools will be loaded dynamically from MCP
    };

    super(options);
  }

  /**
   * Initialize MCP connection and load tools
   */
  async initialize() {
    try {
      // Load tools from MCP server
      const mcpTools = await this.mcpClient.getTools();
      
      // Update agent with MCP tools
      this.tools = mcpTools;
      
      console.log('Enhanced Coder Agent initialized with MCP tools:', Object.keys(mcpTools));
    } catch (error) {
      console.error('Failed to initialize Enhanced Coder Agent:', error);
      throw error;
    }
  }

  /**
   * Enhanced method for cross-repository code generation
   */
  async generateCodeAcrossRepos(prompt: string, options?: {
    repositories?: string[];
    targetBranch?: string;
    createPR?: boolean;
    language?: string;
    framework?: string;
  }) {
    const {
      repositories = [],
      targetBranch = 'feature/ai-generated-code',
      createPR = false,
      language = 'typescript',
      framework,
    } = options || {};

    const enhancedPrompt = `
Multi-repository code generation task:

${prompt}

Requirements:
- Target repositories: ${repositories.length > 0 ? repositories.join(', ') : 'current directory'}
- Language: ${language}
${framework ? `- Framework: ${framework}` : ''}
- Create feature branch: ${targetBranch}
${createPR ? '- Create pull request after implementation' : '- Do not create pull request'}

Workflow:
1. Check current directory and repository status
2. For each target repository:
   - Navigate to repository directory
   - Create feature branch if needed
   - Implement required changes
   - Commit changes with descriptive messages
3. ${createPR ? 'Create pull requests for review' : 'Prepare changes for manual review'}

Use the enhanced MCP tools to manage directories, git operations, and file modifications across repositories.
`;

    return await this.executeTask(enhancedPrompt);
  }

  /**
   * Enhanced method for repository analysis and code review
   */
  async analyzeRepository(repositoryPath: string, options?: {
    branch?: string;
    focusAreas?: string[];
    generateReport?: boolean;
  }) {
    const {
      branch,
      focusAreas = ['code quality', 'security', 'performance'],
      generateReport = true,
    } = options || {};

    const analysisPrompt = `
Repository analysis task:

Repository: ${repositoryPath}
${branch ? `Branch: ${branch}` : ''}
Focus areas: ${focusAreas.join(', ')}
${generateReport ? 'Generate detailed analysis report' : 'Provide summary analysis'}

Tasks:
1. Navigate to repository directory
2. Check current git status and branch
3. ${branch ? `Checkout specified branch: ${branch}` : 'Work with current branch'}
4. Analyze codebase structure and patterns
5. Review code quality, security, and performance aspects
6. Identify potential improvements and issues
7. ${generateReport ? 'Generate comprehensive analysis report' : 'Provide key findings summary'}

Use the enhanced MCP tools to navigate directories, check git status, and analyze files across the repository.
`;

    return await this.executeTask(analysisPrompt);
  }

  /**
   * Enhanced method for managing feature development workflow
   */
  async developFeature(featureDescription: string, options?: {
    repositoryPath?: string;
    branchName?: string;
    createPR?: boolean;
    prTitle?: string;
    prDescription?: string;
  }) {
    const {
      repositoryPath,
      branchName = `feature/${featureDescription.toLowerCase().replace(/\s+/g, '-')}`,
      createPR = true,
      prTitle = `Feature: ${featureDescription}`,
      prDescription = `Implements ${featureDescription}\n\nGenerated by Enhanced Coder Agent`,
    } = options || {};

    const developmentPrompt = `
Feature development workflow:

Feature: ${featureDescription}
${repositoryPath ? `Repository: ${repositoryPath}` : 'Current repository'}
Branch: ${branchName}
${createPR ? `Create PR: ${prTitle}` : 'No PR creation'}

Workflow:
1. ${repositoryPath ? `Navigate to repository: ${repositoryPath}` : 'Use current directory'}
2. Check git status and current branch
3. Create feature branch: ${branchName}
4. Implement feature according to description
5. Test implementation and ensure code quality
6. Commit changes with descriptive commit messages
7. ${createPR ? `Create pull request: "${prTitle}"` : 'Prepare changes for manual PR creation'}

Implementation requirements:
- Follow existing code patterns and conventions
- Include proper error handling and validation
- Add appropriate comments and documentation
- Ensure backward compatibility
- Test edge cases and error scenarios

Use the enhanced MCP tools for all directory navigation, git operations, and file modifications.
`;

    return await this.executeTask(developmentPrompt);
  }

  /**
   * Cleanup method to disconnect MCP client
   */
  async disconnect() {
    try {
      await this.mcpClient.disconnect();
      console.log('Enhanced Coder Agent disconnected from MCP server');
    } catch (error) {
      console.error('Error disconnecting Enhanced Coder Agent:', error);
    }
  }
}

export default EnhancedCoderAgent;