# Enhanced Coder Agent with MCP

This setup provides an advanced coder agent that can work across multiple directories and repositories using the Model Context Protocol (MCP).

## Key Features

✅ **Directory Navigation**: Change directories and work across multiple projects  
✅ **Git Operations**: Clone, checkout branches, commit, create PRs  
✅ **Cross-Repository Development**: Work on multiple codebases simultaneously  
✅ **Enhanced File Operations**: Read/write files with directory context  
✅ **Branch Management**: Create feature branches and manage git workflows  
✅ **Pull Request Creation**: Automated PR creation using GitHub CLI  

## Architecture

```
Enhanced Coder Agent (Client)
    ↓ MCP Protocol (stdio/HTTP)
Enhanced Coder MCP Server
    ↓ Local System Access
File System + Git + Shell Commands
```

## Usage

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Demonstrations

```bash
# Run interactive demonstration
npm run enhanced-coder:demo

# Analyze current project
npm run enhanced-coder:analyze

# Show available commands
npm run coder:help
```

### 3. Manual MCP Server

```bash
# Start MCP server manually (for testing)
npm run mcp-server
```

## MCP Tools Available

### Directory Operations
- `changeDirectory` - Navigate to different directories
- `getCurrentDirectory` - Get current working directory

### Git Operations  
- `gitClone` - Clone repositories
- `gitCheckout` - Switch/create branches
- `gitStatus` - Check repository status
- `gitCommit` - Create commits
- `createPullRequest` - Create PRs with GitHub CLI

### Enhanced File Operations
- `readFileEnhanced` - Read files with directory context
- `writeFileEnhanced` - Write files with directory context
- `executeShellEnhanced` - Run shell commands in specific directories

## Example Workflows

### 1. Repository Analysis
```typescript
const agent = new EnhancedCoderAgent();
await agent.initialize();

await agent.analyzeRepository('/path/to/project', {
  branch: 'main',
  focusAreas: ['code quality', 'security'],
  generateReport: true
});
```

### 2. Feature Development
```typescript
await agent.developFeature('Add user authentication', {
  repositoryPath: '/path/to/project',
  branchName: 'feature/auth',
  createPR: true,
  prTitle: 'Add JWT-based authentication'
});
```

### 3. Cross-Repository Work
```typescript
await agent.generateCodeAcrossRepos(
  'Update API client to use new endpoint',
  {
    repositories: ['/path/to/frontend', '/path/to/backend'],
    targetBranch: 'feature/api-update',
    createPR: true
  }
);
```

## Configuration

The enhanced coder agent uses your existing AI Master configuration:

```json
// ai-master.config.json
{
  "agents": {
    "coder": {
      "name": "Coder Agent",
      "apiUrl": "http://Arbiter2:8080",
      "model": "qwen-2-5-coder",
      "temperature": 0.3,
      "maxTokens": 4096,
      "enabled": true
    }
  }
}
```

## Requirements

- **Node.js**: >=20.9.0
- **Git**: For repository operations
- **GitHub CLI (gh)**: For PR creation (optional)
- **tsx**: For TypeScript execution

## Troubleshooting

### MCP Connection Issues
- Ensure the MCP server process can start
- Check that ports are available
- Verify tsx is installed globally or via npx

### Git Operations
- Ensure git is configured with user.name and user.email
- For PR creation, authenticate with `gh auth login`
- Repository paths must be valid git repositories

### Directory Permissions
- Ensure the agent has read/write access to target directories
- Check that parent directories exist for new projects

## Development

To extend the enhanced coder agent:

1. **Add new MCP tools** in `src/mastra/tools/enhanced-coder-mcp-server.ts`
2. **Update agent instructions** in `src/mastra/agents/enhanced-coder-agent.ts`
3. **Test with examples** in `src/mastra/examples/enhanced-coder-example.ts`

## Security Considerations

- The MCP server has broad file system access
- Git operations can modify repositories
- Shell commands run with current user permissions
- Consider running in sandboxed environments for production use

## Next Steps

1. **Install GitHub CLI**: `brew install gh` (macOS) or equivalent
2. **Authenticate GitHub**: `gh auth login`
3. **Test on sample repository**: Use the demo commands
4. **Integrate with your workflow**: Customize instructions and tools for your use case