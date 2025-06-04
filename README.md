# AIMaster (AIM)

A simple AI agent that communicates with local LLMs and supports tool use.

## Usage

```bash
# Basic usage
node agent.mjs "What is the weather like today?"

# With configuration options
node agent.mjs --model qwen-2-5-coder --log-level debug "Explain quantum computing"

# Using environment variables
AIM_MODEL=gpt-4 AIM_LOG_LEVEL=debug node agent.mjs "Help me with coding"
```

## Configuration

### Environment Variables
- `AIM_API_URL` - API endpoint (default: http://Arbiter2:8080)
- `AIM_MODEL` - Model name (default: qwen-2-5-coder)
- `AIM_LOG_LEVEL` - Logging level (default: info)
- `AIM_MAX_TOKENS` - Maximum response tokens (default: 2048)
- `AIM_TEMPERATURE` - Generation temperature (default: 0.7)

### Command Line Options
- `--api-url` - Override API endpoint
- `--model` - Override model name
- `--log-level` - Override log level (debug, info, warn, error)
- `--max-tokens` - Override max tokens
- `--temperature` - Override temperature

## Tool Support

The agent supports tool calls in JSON responses with automatic execution:

### Available Tools
- `execute_shell_command`: Execute shell/terminal commands safely

### Response Format
The agent responds with JSON containing:
- `content`: Main response to the user
- `thoughts`: Internal reasoning (useful for thinking models like QWEN)
- `tools`: Array of tool calls to execute
- `reasoning`: Explanation of the approach
- `tool_results`: Results from executed tools (added automatically)

```javascript
{
  "content": "I'll list the files for you",
  "thoughts": "The user wants to see directory contents, I'll use ls command",
  "tools": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "execute_shell_command",
        "arguments": {"command": "ls -la"}
      }
    }
  ],
  "reasoning": "Using ls command to show detailed file listing"
}
```

## Development

The main module exports functions for programmatic use:

```javascript
import { getCompletion, getConfig, Logger } from './agent.mjs';

const config = getConfig();
const logger = new Logger('debug');
const response = await getCompletion('Hello!', config, logger);
```