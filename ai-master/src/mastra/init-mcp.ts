/**
 * Auto-initialization script for MCP capabilities
 * Runs after server starts to enable enhanced coder tools
 */

import { initializeCoderAgentMCP } from './index.js';

export async function initializeMCPCapabilities() {
  console.log('🚀 Initializing MCP capabilities for autonomous operation...');
  
  try {
    // Initialize coder agent MCP tools
    await initializeCoderAgentMCP();
    console.log('✅ Coder Agent MCP capabilities initialized');
    
    console.log('🎯 System ready for autonomous operation with:');
    console.log('  - Enhanced directory navigation');
    console.log('  - Git operations (clone, checkout, commit, PR)');
    console.log('  - Cross-repository development');
    console.log('  - Rich context for qwen-2-5-coder model');
    console.log('  - Temperature: 0.1 (high precision)');
    console.log('  - Max tokens: 4096');
    
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize MCP capabilities:', error);
    console.log('⚠️ System will operate with basic capabilities');
    return false;
  }
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeMCPCapabilities().catch(console.error);
}