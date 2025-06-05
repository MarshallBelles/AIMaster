# AI Master - Multi-Agent System

A sophisticated multi-agent AI system built with Mastra that provides specialized agents for different types of tasks, with intelligent delegation and coordination.

## Overview

AI Master consists of multiple specialized agents that work together to handle complex requests:

- **Personal Assistant Agent**: Main coordinator that analyzes requests and delegates to specialized agents
- **Coder Agent**: Specialized for software development, file operations, and technical tasks
- **Extensible Architecture**: Easy to add new specialized agents

## Features

- 🤖 **Multi-Agent Architecture**: Specialized agents for different task types
- 🎯 **Intelligent Delegation**: Personal assistant automatically routes tasks to the right agent
- ⚙️ **Flexible Configuration**: Environment variables + config file support
- 🌐 **Multiple Interfaces**: Web UI (Mastra) + CLI for direct agent access
- 🔧 **Comprehensive Tools**: File operations, shell commands, code generation, debugging
- 📊 **Health Monitoring**: Agent status and health checking
- 🔄 **Workflow Support**: Multi-step task execution and coordination

## Installation

1. **Clone and install dependencies:**
   ```bash
   cd ai-master
   npm install
   ```

2. **Configure your environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API endpoints and preferences
   ```

3. **Optional: Customize configuration:**
   ```bash
   # Edit ai-master.config.json for advanced configuration
   ```

## Configuration

### Environment Variables

```bash
# Personal Assistant Agent
PERSONAL_ASSISTANT_API_URL=http://localhost:11434
PERSONAL_ASSISTANT_MODEL=llama3.2
PERSONAL_ASSISTANT_TEMPERATURE=0.7

# Coder Agent  
CODER_API_URL=http://Arbiter2:8080
CODER_MODEL=qwen-2-5-coder
CODER_TEMPERATURE=0.3

# Server Configuration
PORT=3000
HOST=localhost
```

### Configuration File

The `ai-master.config.json` file provides additional configuration options and overrides environment variables.

## Usage

### Web Interface (Mastra)

Start the Mastra web interface:

```bash
npm run dev
```

This provides a user-friendly web interface for interacting with all agents.

### CLI Interface

#### Direct Commands

```bash
# Ask the Personal Assistant (recommended for most tasks)
npm run cli ask "Help me create a new React component"

# Direct interaction with Coder Agent
npm run cli code "Create a TypeScript function to validate email addresses"

# Debug code
npm run cli debug "./src/components/MyComponent.tsx" --error "React hook error"

# System status
npm run cli status
```

#### Interactive Mode

```bash
npm run cli interactive
```

This starts an interactive session where you can choose actions and agents.

#### Built CLI (after build)

```bash
# Build the project first
npm run build

# Then use the built CLI
npm run cli:build ask "Your request here"
```

## Agent Specializations

### Personal Assistant Agent

**Role**: Main coordinator and task analyzer

**Capabilities**:
- Analyzes incoming requests
- Determines optimal approach and agent delegation
- Handles general questions and coordination
- Creates task plans for complex workflows
- Monitors and coordinates multi-step processes

**Use Cases**:
- General questions and conversations
- Complex task planning and coordination
- Multi-agent workflow orchestration
- Task analysis and strategic planning

### Coder Agent

**Role**: Software development specialist

**Capabilities**:
- Code generation and implementation
- File system operations
- Shell command execution
- Debugging and code analysis
- Project setup and configuration
- Testing and validation

**Use Cases**:
- Code generation and modification
- File operations (create, read, write, organize)
- Debugging and troubleshooting
- Project setup and scaffolding
- Development automation tasks

## Examples

### Basic Usage

```bash
# General request (automatically routed)
npm run cli ask "I need to create a REST API for user management"

# Specific coding task
npm run cli code "Create a Express.js middleware for authentication"

# Debug assistance
npm run cli debug "./api/auth.js" --error "JWT token validation failing"
```

### Complex Workflows

The Personal Assistant can handle complex multi-step requests:

```bash
npm run cli ask "Set up a new Node.js project with TypeScript, Express, and testing framework"
```

This will:
1. Analyze the requirements
2. Create a task plan
3. Delegate implementation steps to the Coder Agent
4. Coordinate the entire workflow
5. Verify completion

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐
│  Personal Assistant │    │    Coder Agent      │
│                     │    │                     │
│ • Task Analysis     │◄──►│ • Code Generation   │
│ • Delegation        │    │ • File Operations   │
│ • Coordination      │    │ • Shell Commands    │
│ • Planning          │    │ • Debugging         │
└─────────────────────┘    └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│   Mastra Framework  │
│                     │
│ • Web Interface     │
│ • Agent Management  │
│ • Tool Integration  │
│ • Workflow Engine   │
└─────────────────────┘
```

## Development

### Adding New Agents

1. Create agent class extending `BaseAgent`
2. Define specialized tools in `src/mastra/tools/`
3. Register agent with Personal Assistant
4. Update configuration schema

### Adding New Tools

1. Create tool using `createTool` from `@mastra/core`
2. Add to appropriate agent's tool set
3. Update agent instructions to include tool usage

### Testing

```bash
# Test agent health
npm run cli status

# Test specific functionality
npm run cli ask "test request"
```

## API Compatibility

The system is designed to work with OpenAI-compatible APIs, including:

- Local LLMs via Ollama
- Local servers (llama.cpp, etc.)
- OpenAI API
- Other compatible endpoints

## Troubleshooting

### Agent Health Issues

```bash
# Check system status
npm run cli status

# Verify API endpoints are accessible
curl http://Arbiter2:8080/v1/models
curl http://localhost:11434/api/tags
```

### Configuration Issues

```bash
# Show current config
npm run cli config --show

# Reload configuration
npm run cli config --reload
```

### Common Issues

1. **API Connection Errors**: Verify your API URLs are correct and servers are running
2. **Model Not Found**: Ensure the specified models are available on your endpoints
3. **Permission Errors**: Check file system permissions for file operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your agent or tool
4. Update documentation
5. Submit a pull request

## License

ISC License - see LICENSE file for details.