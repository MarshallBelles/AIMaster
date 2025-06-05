/**
 * Configuration system for AI Master agents
 * Supports both environment variables and config file overrides
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Configuration schema
const AgentConfigSchema = z.object({
  name: z.string(),
  apiUrl: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(2048),
  enabled: z.boolean().default(true),
});

const AppConfigSchema = z.object({
  agents: z.object({
    personalAssistant: AgentConfigSchema,
    coder: AgentConfigSchema,
  }),
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('localhost'),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
  }),
  telemetry: z.object({
    enabled: z.boolean().default(false),
  }),
});

type AppConfig = z.infer<typeof AppConfigSchema>;
type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Default configuration
const DEFAULT_CONFIG: AppConfig = {
  agents: {
    personalAssistant: {
      name: 'Personal Assistant',
      apiUrl: process.env.PERSONAL_ASSISTANT_API_URL || 'http://localhost:11434',
      model: process.env.PERSONAL_ASSISTANT_MODEL || 'llama3.2',
      temperature: parseFloat(process.env.PERSONAL_ASSISTANT_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.PERSONAL_ASSISTANT_MAX_TOKENS || '2048'),
      enabled: process.env.PERSONAL_ASSISTANT_ENABLED !== 'false',
    },
    coder: {
      name: 'Coder Agent',
      apiUrl: process.env.CODER_API_URL || 'http://Arbiter2:8080',
      model: process.env.CODER_MODEL || 'qwen-2-5-coder',
      temperature: parseFloat(process.env.CODER_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.CODER_MAX_TOKENS || '4096'),
      enabled: process.env.CODER_ENABLED !== 'false',
    },
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || 'localhost',
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    format: (process.env.LOG_FORMAT as any) || 'pretty',
  },
  telemetry: {
    enabled: process.env.MASTRA_TELEMETRY_ENABLED === 'true',
  },
};

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = DEFAULT_CONFIG;
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  async loadConfig(configPath?: string): Promise<void> {
    let fileConfig = {};

    // Try to load config file
    const configFile = configPath || path.resolve(process.cwd(), 'ai-master.config.json');
    
    try {
      const fileContent = await fs.readFile(configFile, 'utf8');
      fileConfig = JSON.parse(fileContent);
      console.log(`Loaded config from: ${configFile}`);
    } catch (error) {
      console.log(`No config file found at ${configFile}, using defaults and environment variables`);
    }

    // Merge file config with default config (file config takes precedence)
    const mergedConfig = this.deepMerge(DEFAULT_CONFIG, fileConfig);

    // Validate the merged configuration
    try {
      this.config = AppConfigSchema.parse(mergedConfig);
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw new Error('Invalid configuration');
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getAgentConfig(agentName: keyof AppConfig['agents']): AgentConfig {
    return this.config.agents[agentName];
  }

  updateAgentConfig(agentName: keyof AppConfig['agents'], updates: Partial<AgentConfig>): void {
    this.config.agents[agentName] = { ...this.config.agents[agentName], ...updates };
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

export { ConfigManager, AppConfig, AgentConfig };
export default ConfigManager.getInstance();