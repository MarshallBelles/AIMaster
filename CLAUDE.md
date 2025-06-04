# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Interactive mode (default when no prompt provided)
node agent.mjs
node agent.mjs --interactive

# Non-interactive mode with prompt
node agent.mjs "your prompt here"

# Run with specific configuration
node agent.mjs --model qwen-2-5-coder --log-level debug "your prompt"

# Using environment variables
AIM_MODEL=gpt-4 AIM_LOG_LEVEL=debug node agent.mjs "your prompt"

# Start the agent (npm script)
npm start

# Get help
node agent.mjs --help
```

## Architecture Overview

This is AIMaster (AIM), a Node.js-based AI agent that communicates with local LLMs via OpenAI-compatible APIs. The core architecture:

**Single Module Design**: Everything is contained in `agent.mjs` as an ES module with TypeScript-style JSDoc annotations.

**Dual Interface System**: 
- **Interactive Mode**: Beautiful CLI with real-time thinking display, colored output, and progressive streaming
- **Non-Interactive Mode**: JSON output for programmatic use with streaming buffered internally

**JSON Response Protocol**: The agent enforces a strict JSON response format from LLMs containing:
- `thoughts`: Internal reasoning (streams first for real-time thinking display)
- `content`: Main response to user
- `reasoning`: Explanation of approach
- `tools`: Array of tool calls to execute
- `tool_results`: Results from executed tools (added automatically)

**Always-On Streaming**: 
- Streaming is always enabled for maximum performance
- Interactive mode: Real-time thinking display with beautiful formatting
- Non-interactive mode: Streaming buffered internally, outputs final JSON
- Progressive JSON field parsing for reliable tool execution

**Tool System**: Comprehensive file system and shell access:
- `execute_shell_command`: Shell commands with 60s timeout and 1MB buffer limit
- `read_file`: Read file contents (cross-platform)
- `write_file`: Write files with automatic directory creation
- `append_to_file`: Append content to files
- `list_directory`: List directory contents with optional detailed info
- `create_directory`: Create directories recursively
- `copy_files`: Copy files/directories (cross-platform)
- `move_files`: Move/rename files and directories
- `delete_file`: Delete files safely
- `get_file_info`: Get detailed file/directory information
- `search_files`: Search files by pattern (supports wildcards)
- `find_and_replace`: Find and replace text across multiple files

**Logging System**: 
- JSON structured logs with timestamps for non-interactive mode
- Pretty colored logs for interactive mode
- All logs output to stderr to keep stdout clean

**Configuration**: Uses Commander.js for CLI parsing, environment variables (`AIM_*`), and command-line flags. Default API endpoint is `http://Arbiter2:8080` with `qwen-2-5-coder` model.

## Key Implementation Details

- Tool execution happens sequentially after LLM response
- Shell commands are executed via Node.js `child_process.exec` with promisify
- File operations use Node.js `fs/promises` for cross-platform compatibility
- Automatic directory creation and recursive operations for file tools
- Pattern matching with wildcards (* and ?) for file search operations
- Error handling with graceful fallbacks for all file operations
- Logger with configurable levels (debug, info, warn, error)
- Command-line argument parsing strips configuration flags from user prompt
- Response is output as formatted JSON to stdout