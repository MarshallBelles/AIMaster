
/**
 * Main Mastra configuration for AI Master
 * Sets up all agents, tools, and workflows with telemetry disabled
 */

import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { CoderAgent } from './agents/coder-agent.js';
import { EnhancedCoderAgent } from './agents/enhanced-coder-agent.js';
import { PersonalAssistantAgent } from './agents/personal-assistant.js';
import { enhancedCoderMCPServer } from './tools/enhanced-coder-mcp-server.js';

// Initialize basic agents that work synchronously
const personalAssistant = new PersonalAssistantAgent();

// Create basic coder agent for server registration (without MCP for now)
const coderAgent = new CoderAgent();

// Enhanced agents that need async setup for MCP
let enhancedCoderAgent: EnhancedCoderAgent | undefined;

// Function to initialize coder agent MCP after server start
export async function initializeCoderAgentMCP() {
  try {
    await coderAgent.initialize();
    console.log('Coder Agent MCP capabilities initialized');
    return coderAgent;
  } catch (error) {
    console.error('Failed to initialize Coder Agent MCP:', error);
    return coderAgent; // Return basic agent even if MCP fails
  }
}

// Function to initialize enhanced coder agent
export async function initializeEnhancedCoderAgent() {
  if (!enhancedCoderAgent) {
    enhancedCoderAgent = new EnhancedCoderAgent();
    await enhancedCoderAgent.initialize();
  }
  return enhancedCoderAgent;
}

// Main Mastra instance with telemetry disabled
export const mastra: Mastra = new Mastra({
  workflows: {},
  agents: {
    coder: coderAgent,
    personalAssistant,
    // enhancedCoder will be available via initializeEnhancedCoderAgent()
  },
  mcpServers: {
    enhancedCoder: enhancedCoderMCPServer,
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    enabled: false, // Telemetry disabled
  },
});

// Export agents for direct use
export { 
  coderAgent, 
  personalAssistant, 
  enhancedCoderAgent,
  enhancedCoderMCPServer
};
