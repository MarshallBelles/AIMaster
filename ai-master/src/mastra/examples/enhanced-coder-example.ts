/**
 * Example demonstrating Enhanced Coder Agent with MCP capabilities
 * Shows directory navigation, git operations, and cross-repository development
 */

import { EnhancedCoderAgent } from '../agents/enhanced-coder-agent.js';

async function demonstrateEnhancedCoderAgent() {
  const agent = new EnhancedCoderAgent();
  
  try {
    console.log('🚀 Initializing Enhanced Coder Agent with MCP...');
    await agent.initialize();
    
    console.log('✅ Enhanced Coder Agent ready!\n');

    // Example 1: Basic directory navigation and status check
    console.log('📁 Example 1: Directory Navigation and Git Status');
    const statusResponse = await agent.executeTask(`
      Check the current directory and git status. 
      Show me what repository we're currently in and its current state.
      List the files in the current directory.
    `);
    console.log('Status Response:', statusResponse.text);
    console.log('---\n');

    // Example 2: Repository analysis
    console.log('🔍 Example 2: Repository Analysis');
    const analysisResponse = await agent.analyzeRepository('.', {
      focusAreas: ['code structure', 'dependencies', 'git history'],
      generateReport: true,
    });
    console.log('Analysis Response:', analysisResponse.text);
    console.log('---\n');

    // Example 3: Feature development simulation
    console.log('⚡ Example 3: Feature Development Workflow');
    const featureResponse = await agent.developFeature('Add logging configuration', {
      branchName: 'feature/logging-config',
      createPR: false, // Don't actually create PR in demo
      prTitle: 'Add centralized logging configuration',
    });
    console.log('Feature Development Response:', featureResponse.text);
    console.log('---\n');

    // Example 4: Cross-repository code generation
    console.log('🔄 Example 4: Cross-Repository Operations');
    const crossRepoResponse = await agent.generateCodeAcrossRepos(
      'Create a utility function for environment variable validation',
      {
        language: 'typescript',
        targetBranch: 'feature/env-validation',
        createPR: false,
      }
    );
    console.log('Cross-Repo Response:', crossRepoResponse.text);
    console.log('---\n');

  } catch (error) {
    console.error('❌ Error during demonstration:', error);
  } finally {
    // Clean up
    console.log('🧹 Cleaning up...');
    await agent.disconnect();
    console.log('✅ Enhanced Coder Agent demonstration complete!');
  }
}

// Example of using the agent for real development tasks
async function realWorldExample() {
  const agent = new EnhancedCoderAgent();
  
  try {
    await agent.initialize();
    
    // Real-world scenario: Review a codebase and propose improvements
    const projectPath = process.argv[2] || '.';
    
    console.log(`🔍 Analyzing project at: ${projectPath}`);
    
    const response = await agent.executeTask(`
      1. Navigate to the directory: ${projectPath}
      2. Check the git status and current branch
      3. Analyze the project structure and identify:
         - Main technologies and frameworks used
         - Code organization patterns
         - Potential areas for improvement
         - Security considerations
         - Performance optimization opportunities
      4. Create a summary report with actionable recommendations
      
      Focus on practical improvements that would benefit the development workflow.
    `);
    
    console.log('Project Analysis:');
    console.log(response.text);
    
  } catch (error) {
    console.error('Error in real-world example:', error);
  } finally {
    await agent.disconnect();
  }
}

// Main execution
async function main() {
  const mode = process.argv[2];
  
  if (mode === 'demo') {
    await demonstrateEnhancedCoderAgent();
  } else if (mode === 'analyze') {
    await realWorldExample();
  } else {
    console.log(`
Enhanced Coder Agent Example

Usage:
  npx tsx src/mastra/examples/enhanced-coder-example.ts demo     # Run demonstration
  npx tsx src/mastra/examples/enhanced-coder-example.ts analyze # Analyze current project

Features demonstrated:
- Directory navigation and git operations
- Repository analysis and code review
- Feature development workflows
- Cross-repository development
- Pull request creation
- Branch management

The Enhanced Coder Agent uses MCP (Model Context Protocol) to provide:
✅ Directory navigation across multiple projects
✅ Git operations (clone, checkout, commit, PR creation)
✅ Enhanced file operations with directory context
✅ Shell command execution in specific directories
✅ Workflow orchestration across repositories
    `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { demonstrateEnhancedCoderAgent, realWorldExample };