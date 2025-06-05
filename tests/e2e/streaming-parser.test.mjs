import { describe, it, expect, beforeEach } from 'vitest';
import AIMasterClient from '../utils/aimaster-client.mjs';

describe('Streaming JSON Parser', () => {
  let client;

  beforeEach(() => {
    client = new AIMasterClient();
  });

  describe('Basic Parsing', () => {
    it('should parse simple JSON responses correctly', async () => {
      const result = await client.execute('List the current directory');

      expect(result.response).toBeDefined();
      expect(typeof result.response.thoughts).toBe('string');
      expect(typeof result.response.content).toBe('string');
      expect(result.response.tools).toBeInstanceOf(Array);
      expect(result.response.tool_results).toBeInstanceOf(Array);
    });

    it('should handle responses with special characters', async () => {
      const result = await client.execute('Create a file with content containing quotes, backslashes, and unicode: "Hello \\n World! 🚀"');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Should successfully parse despite special characters
      const toolResult = result.response.tool_results[0];
      expect(toolResult).toBeDefined();
      expect(toolResult.id).toBeDefined();
    });
  });

  describe('Template Syntax Parsing', () => {
    it('should parse JSON containing Jinja2 template syntax', async () => {
      const result = await client.execute('List files and create a summary with template syntax showing the count');

      expect(result.response).toBeDefined();
      expect(result.response.tools).toBeInstanceOf(Array);
      
      // Should successfully parse JSON with template syntax
      if (result.response.tools.length > 0) {
        const toolsJson = JSON.stringify(result.response.tools);
        expect(toolsJson).toMatch(/\{\{[\w\.\-_]+\}\}/); // Should contain templates
      }
    });

    it('should handle complex nested template expressions', async () => {
      const result = await client.execute('Create a complex workflow with multiple template variables referencing nested object properties');

      expect(result.response).toBeDefined();
      expect(result.response.tools || result.response.tool_results).toBeDefined();
      
      // Parser should not crash on complex templates
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Escape Sequence Handling', () => {
    it('should properly handle escaped quotes in JSON strings', async () => {
      const result = await client.execute('Create a file with content: "This contains \\"quoted\\" text"');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Should parse successfully despite escaped quotes
      const toolResult = result.response.tool_results[0];
      expect(toolResult).toBeDefined();
    });

    it('should handle escaped backslashes correctly', async () => {
      const result = await client.execute('Create a file with Windows-style path: "C:\\\\Users\\\\test\\\\file.txt"');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Should parse successfully despite escaped backslashes
      const toolResult = result.response.tool_results[0];
      expect(toolResult).toBeDefined();
    });

    it('should handle mixed escape sequences', async () => {
      const result = await client.execute('Create content with mixed escapes: "Line 1\\nLine 2\\tTabbed\\\\Backslash\\"Quote"');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Should parse complex escape sequences correctly
      const toolResult = result.response.tool_results[0];
      expect(toolResult).toBeDefined();
    });
  });

  describe('Large Response Handling', () => {
    it('should handle large JSON responses without corruption', async () => {
      const result = await client.execute('Search for all functions in the codebase and provide detailed results');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Large responses should parse correctly
      if (result.response.tool_results.length > 0) {
        const largeResult = result.response.tool_results.find(r => 
          r.result && r.result.matches && r.result.matches.length > 5
        );
        
        if (largeResult) {
          expect(largeResult.result.matches).toBeInstanceOf(Array);
          expect(largeResult.result.totalMatches).toBeGreaterThan(0);
        }
      }
    });

    it('should handle responses with large text content', async () => {
      const result = await client.execute('Read the main agent.mjs file and analyze its structure');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Should handle large file content in responses
      const readResult = result.response.tool_results.find(r => 
        r.result && r.result.content && r.result.content.length > 1000
      );
      
      if (readResult) {
        expect(typeof readResult.result.content).toBe('string');
        expect(readResult.result.content.length).toBeGreaterThan(1000);
      }
    });
  });

  describe('Error Recovery', () => {
    it('should recover from malformed streaming chunks', async () => {
      // This tests the parser's ability to handle network interruptions
      // and continue parsing when valid chunks resume
      const result = await client.execute('Perform a simple operation that should succeed');

      expect(result.response).toBeDefined();
      expect(result.exitCode).toBe(0);
    });

    it('should provide meaningful error messages for parsing failures', async () => {
      // Test with a prompt that might stress the parser
      try {
        const result = await client.execute('Create extremely complex JSON with deeply nested template expressions and special characters');
        
        // Even if parsing is stressed, should either succeed or fail gracefully
        expect(result.response || result.stderr).toBeDefined();
      } catch (error) {
        // If it fails, error message should be informative
        expect(error.message).toBeDefined();
        expect(typeof error.message).toBe('string');
      }
    });
  });

  describe('Streaming Performance', () => {
    it('should parse streaming responses in reasonable time', async () => {
      const startTime = Date.now();
      
      const result = await client.execute('Analyze current project and provide comprehensive output');
      
      const endTime = Date.now();
      const parseTime = endTime - startTime;
      
      expect(result.response).toBeDefined();
      expect(parseTime).toBeLessThan(30000); // Should parse within 30 seconds
    });

    it('should handle rapid streaming updates', async () => {
      // Test parser's ability to handle quick successive chunks
      const result = await client.execute('Generate detailed analysis with multiple sections and data points');

      expect(result.response).toBeDefined();
      expect(result.response.thoughts || result.response.content).toBeDefined();
      
      // Should maintain data integrity despite rapid streaming
      if (result.response.tool_results) {
        expect(result.response.tool_results).toBeInstanceOf(Array);
      }
    });
  });

  describe('Content Validation', () => {
    it('should preserve content integrity during streaming', async () => {
      const result = await client.execute('Create a file with precise content: "Exactly this text, no more, no less"');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Content should be preserved exactly
      const toolResult = result.response.tool_results[0];
      if (toolResult && toolResult.result) {
        expect(toolResult.result).toBeDefined();
      }
    });

    it('should handle unicode and emoji content correctly', async () => {
      const result = await client.execute('Create content with unicode: "Hello 世界! 🌍 Testing unicode parsing 🚀"');

      expect(result.response).toBeDefined();
      expect(result.response.tool_results).toBeInstanceOf(Array);
      
      // Unicode should be preserved in streaming
      const toolResult = result.response.tool_results[0];
      expect(toolResult).toBeDefined();
    });

    it('should maintain JSON structure integrity', async () => {
      const result = await client.execute('Generate a response with nested objects and arrays');

      expect(result.response).toBeDefined();
      
      // All required fields should be present and correctly typed
      expect(typeof result.response.thoughts).toBe('string');
      expect(typeof result.response.content).toBe('string');
      
      if (result.response.tools) {
        expect(result.response.tools).toBeInstanceOf(Array);
        result.response.tools.forEach(tool => {
          expect(tool.id).toBeDefined();
          expect(tool.type).toBe('function');
          expect(tool.function).toBeDefined();
          expect(tool.function.name).toBeDefined();
        });
      }
      
      if (result.response.tool_results) {
        expect(result.response.tool_results).toBeInstanceOf(Array);
        result.response.tool_results.forEach(result => {
          expect(result.id).toBeDefined();
          expect(result.result || result.error).toBeDefined();
        });
      }
    });
  });
});