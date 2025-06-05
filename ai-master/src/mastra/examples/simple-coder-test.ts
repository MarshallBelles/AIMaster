/**
 * Simple test for Coder Agent with timeout
 */

import { initializeCoderAgent } from '../index.js';

async function simpleCoderTest() {
  console.log('🚀 Simple Coder Agent Test...');
  
  let agent;
  try {
    // Initialize the coder agent
    agent = await initializeCoderAgent();
    console.log('✅ Coder Agent initialized');
    
    // Test with a simple directory check
    console.log('\n📁 Testing simple directory check...');
    
    // Set a shorter timeout for the test
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Test timed out after 20 seconds')), 20000);
    });
    
    const taskPromise = agent.executeTask(`
      Please help me understand the current directory:
      1. Use getCurrentDirectory to see where we are
      2. Use listDirectory to show the contents of the current directory
      3. Give me a brief summary
      
      Keep it simple and quick.
    `);
    
    const response = await Promise.race([taskPromise, timeoutPromise]);
    
    console.log('\n📋 Response:');
    console.log(response.text);
    console.log('\n✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (agent) {
      try {
        await agent.disconnect();
        console.log('🧹 Agent disconnected');
      } catch (e) {
        console.error('Disconnect error:', e.message);
      }
    }
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  simpleCoderTest().catch(console.error);
}

export { simpleCoderTest };