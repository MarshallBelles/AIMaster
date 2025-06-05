# AIMaster E2E Testing Framework

Comprehensive end-to-end testing suite for AIMaster's core functionality including tool execution, Jinja2 templating, and streaming JSON parsing.

## Test Structure

```
tests/
├── e2e/                    # End-to-end integration tests
│   ├── basic-tools.test.mjs    # Basic tool execution tests
│   ├── templating.test.mjs     # Jinja2 templating system tests
│   ├── workflows.test.mjs      # Complex multi-tool workflow tests
│   └── streaming-parser.test.mjs # Streaming JSON parser tests
├── utils/                  # Test utilities and helpers
│   ├── aimaster-client.mjs     # AIMaster API client for testing
│   ├── test-helpers.mjs        # Common test utilities
│   ├── output-paths.mjs        # Output directory path management
│   └── global-setup.mjs        # Global test setup and teardown
└── fixtures/               # Test fixtures and sample data

output/                     # All test artifacts go here
├── tests/                  # Test output files
├── temp/                   # Temporary test directories
├── logs/                   # Test execution logs  
├── reports/                # Test reports and coverage
└── artifacts/              # Test artifacts and generated files
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx vitest tests/e2e/basic-tools.test.mjs

# Run tests matching pattern
npx vitest --reporter=verbose templating
```

## Output Directory Management

All test artifacts are automatically organized in the `output/` directory:

```bash
# Clean test artifacts (preserves reports)
npm run clean

# Clean everything including reports
npm run clean:all

# Clean only test reports
npm run clean:reports

# Setup output directories
npm run setup:output
```

**Output Directory Structure:**
- `output/tests/` - Test-generated files (write operations, etc.)
- `output/temp/` - Temporary test directories and files
- `output/logs/` - Test execution logs and debug output
- `output/reports/` - Test reports, coverage, and results
- `output/artifacts/` - Generated artifacts and analysis files

## Test Categories

### 1. Basic Tool Execution (`basic-tools.test.mjs`)
- File operations (read, write, copy, move, delete)
- Shell command execution
- Directory operations
- Search functionality (file search, ripgrep)
- Todo system operations
- Response format validation

### 2. Jinja2 Templating (`templating.test.mjs`)
- Template syntax detection and generation
- Template variable resolution
- Dependency resolution and execution order
- Complex template paths and nested objects
- Error handling and fallback mechanisms
- Integration with real workflows

### 3. Complex Workflows (`workflows.test.mjs`)
- Project analysis workflows
- File processing pipelines
- Search and analysis chains
- Todo management integration
- Error recovery and resilience
- Performance and scalability testing
- Real-world scenario testing

### 4. Streaming JSON Parser (`streaming-parser.test.mjs`)
- Basic JSON parsing accuracy
- Template syntax parsing
- Escape sequence handling
- Large response handling
- Error recovery mechanisms
- Performance testing
- Content integrity validation

## Test Utilities

### AIMasterClient
The `AIMasterClient` class provides a convenient interface for testing AIMaster:

```javascript
import AIMasterClient from '../utils/aimaster-client.mjs';

const client = new AIMasterClient();

// Execute a prompt and get full response
const result = await client.execute('List current directory');

// Execute and verify tools succeeded
const result = await client.executeAndVerify('Create a test file');

// Get just the tools array
const tools = await client.getTools('Generate a workflow');

// Check if response uses templating
const usesTemplates = await client.usesTemplating('Create summary with file count');
```

### Test Helpers
Common utilities for test setup and cleanup:

```javascript
import { 
  cleanupFiles, 
  createTempDir, 
  cleanupTempDir,
  extractTemplateVars,
  assertTemplateVars 
} from '../utils/test-helpers.mjs';

// Cleanup test files
await cleanupFiles(['test1.txt', 'test2.txt']);

// Create temporary directory
const tempDir = await createTempDir('my-test');

// Extract template variables from content
const vars = extractTemplateVars('Found {{files.count}} files');
```

## Configuration

The test suite is configured via `vitest.config.js`:

- **Environment**: Node.js
- **Timeout**: 30 seconds for E2E tests
- **Pool**: Forks (separate processes for isolation)
- **Coverage**: Text, JSON, and HTML reports
- **Reporters**: Verbose output for detailed feedback

## Best Practices

1. **Test Isolation**: Each test runs in isolation with proper cleanup
2. **File Management**: All test files are tracked and cleaned up automatically
3. **Error Handling**: Tests verify both success and failure scenarios
4. **Performance**: Tests include timing assertions for performance regression detection
5. **Real-world Scenarios**: Tests simulate actual usage patterns and workflows

## Continuous Integration

Tests are designed to run in CI environments:

```bash
# CI test command
npm run test:run
```

All tests should pass in a clean environment with AIMaster's dependencies installed.

## Debugging Tests

For debugging failing tests:

```bash
# Run with debug output
DEBUG=* npm test

# Run single test with verbose output
npx vitest --reporter=verbose tests/e2e/basic-tools.test.mjs

# Run tests with UI for interactive debugging
npm run test:ui
```

## Contributing

When adding new features to AIMaster:

1. Add corresponding tests to the appropriate test file
2. Update test utilities if new testing patterns are needed
3. Ensure all tests pass before submitting changes
4. Add performance tests for features that could impact speed

The test suite serves as both validation and documentation of AIMaster's capabilities.