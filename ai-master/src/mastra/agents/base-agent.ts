/**
 * Base Agent class for all AI Master agents
 * Provides common functionality and standardized interface
 */

import { Agent } from '@mastra/core';
import { createOpenAI } from '@ai-sdk/openai';
import { AgentConfig } from '../../config/index.js';

export interface BaseAgentOptions {
  name: string;
  description: string;
  config: AgentConfig;
  instructions: string;
  tools?: Record<string, any>;
}

export class BaseAgent extends Agent {
  public readonly agentName: string;
  public readonly config: AgentConfig;

  constructor(options: BaseAgentOptions) {
    const { name, config, instructions, tools = {} } = options;

    // Create model instance based on config
    const openaiProvider = createOpenAI({
      baseURL: config.apiUrl.endsWith('/v1') ? config.apiUrl : `${config.apiUrl}/v1`,
      apiKey: 'not-needed-for-local', // Most local servers don't require API keys
    });
    const model = openaiProvider(config.model as any);

    super({
      name,
      instructions,
      model,
      tools,
    });

    this.agentName = name;
    this.config = config;
  }

  /**
   * Get agent status and configuration
   */
  getStatus() {
    return {
      name: this.agentName,
      enabled: this.config.enabled,
      apiUrl: this.config.apiUrl,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    };
  }

  /**
   * Check if agent is healthy and can make requests
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check by making a minimal request
      const response = await this.generate('Health check', {
        maxTokens: 10,
      });
      return response.text?.length > 0;
    } catch (error) {
      console.error(`Health check failed for ${this.agentName}:`, error);
      return false;
    }
  }

  /**
   * Execute a task with proper error handling and logging
   */
  async executeTask(input: string, context?: any) {
    try {
      console.log(`[${this.agentName}] Executing task: ${input.substring(0, 100)}...`);
      
      const response = await this.generate(input, {
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        ...context,
      });

      console.log(`[${this.agentName}] Task completed successfully`);
      return response;
    } catch (error) {
      console.error(`[${this.agentName}] Task execution failed:`, error);
      throw error;
    }
  }
}

export default BaseAgent;