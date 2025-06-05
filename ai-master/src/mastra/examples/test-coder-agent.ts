/**
 * Test script for the updated Coder Agent with MCP capabilities
 */

import { initializeCoderAgent } from '../index.js';

async function testCoderAgent() {
  console.log('🚀 Testing Coder Agent with MCP capabilities...');
  
  try {
    // Initialize the coder agent
    const agent = await initializeCoderAgent();
    console.log('✅ Coder Agent initialized successfully');
    
    // Test basic functionality - analyze UserPortal
    console.log('\n📁 Testing UserPortal analysis...');
    const response = await agent.executeTask(`
      Navigate to the directory /Users/marshallbelles/UserPortal and analyze its contents.
      
      Please:
      1. First check the current directory with getCurrentDirectory
      2. Change to the UserPortal directory using changeDirectory
      3. List the contents with listDirectory (use detailed=true)
      4. Look for key files like package.json, README.md, or configuration files
      5. Provide a summary of what you find about this workspace
      
      Use the enhanced MCP tools: getCurrentDirectory, changeDirectory, listDirectory
    `);
    
    console.log('\n📋 Analysis Result:');
    console.log(response.text);
    
    // Clean up
    await agent.disconnect();
    console.log('\n✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testCoderAgent().catch(console.error);
}

export { testCoderAgent };