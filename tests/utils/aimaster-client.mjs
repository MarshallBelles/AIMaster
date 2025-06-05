import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AIMaster E2E Test Client
 * Provides utilities for testing AIMaster in non-interactive mode
 */
export class AIMasterClient {
  constructor() {
    this.agentPath = path.resolve(__dirname, '../../agent.mjs');
  }

  /**
   * Execute AIMaster with a prompt and return parsed JSON response
   * @param {string} prompt - The prompt to send to AIMaster
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async execute(prompt, options = {}) {
    const { timeout = 30000, model = 'qwen-2-5-coder' } = options;
    
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      
      const args = [];
      if (model !== 'qwen-2-5-coder') {
        args.push('--model', model);
      }
      args.push(prompt);
      
      const child = spawn('node', [this.agentPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`AIMaster execution timed out after ${timeout}ms`));
      }, timeout);
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        clearTimeout(timer);
        
        if (code !== 0) {
          reject(new Error(`AIMaster exited with code ${code}. stderr: ${stderr}`));
          return;
        }
        
        try {
          // Parse the JSON response from stdout
          const jsonResponse = JSON.parse(stdout.trim());
          resolve({
            response: jsonResponse,
            stderr: stderr,
            exitCode: code
          });
        } catch (error) {
          reject(new Error(`Failed to parse JSON response: ${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`));
        }
      });
      
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn AIMaster process: ${error.message}`));
      });
    });
  }

  /**
   * Execute AIMaster and return only the tools array from response
   * @param {string} prompt - The prompt to send to AIMaster  
   * @returns {Promise<Array>} Tools array from response
   */
  async getTools(prompt) {
    const result = await this.execute(prompt);
    return result.response.tools || [];
  }

  /**
   * Execute AIMaster and return only the tool results
   * @param {string} prompt - The prompt to send to AIMaster
   * @returns {Promise<Array>} Tool results array
   */
  async getToolResults(prompt) {
    const result = await this.execute(prompt);
    return result.response.tool_results || [];
  }

  /**
   * Check if AIMaster response contains specific tools
   * @param {string} prompt - The prompt to send
   * @param {Array<string>} expectedTools - Array of expected tool names
   * @returns {Promise<boolean>} Whether all expected tools are present
   */
  async hasTools(prompt, expectedTools) {
    const tools = await this.getTools(prompt);
    const toolNames = tools.map(tool => tool.function?.name);
    return expectedTools.every(expectedTool => toolNames.includes(expectedTool));
  }

  /**
   * Check if AIMaster response uses templating syntax
   * @param {string} prompt - The prompt to send
   * @returns {Promise<boolean>} Whether response contains template syntax
   */
  async usesTemplating(prompt) {
    const tools = await this.getTools(prompt);
    const toolsJson = JSON.stringify(tools);
    return /\{\{[\w\.\-_]+\}\}/.test(toolsJson);
  }

  /**
   * Execute AIMaster and verify tools executed successfully
   * @param {string} prompt - The prompt to send
   * @returns {Promise<Object>} Execution results with success flags
   */
  async executeAndVerify(prompt) {
    const result = await this.execute(prompt);
    const toolResults = result.response.tool_results || [];
    
    const successful = toolResults.filter(result => result.result && !result.error);
    const failed = toolResults.filter(result => result.error);
    
    return {
      ...result,
      toolResults,
      successful,
      failed,
      allSucceeded: failed.length === 0 && successful.length > 0,
      successCount: successful.length,
      failureCount: failed.length
    };
  }
}

export default AIMasterClient;