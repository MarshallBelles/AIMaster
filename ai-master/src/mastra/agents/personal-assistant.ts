/**
 * Personal Assistant Agent - Main coordinator and task delegator
 */

import { BaseAgent, BaseAgentOptions } from './base-agent.js';
import { assistantTools } from '../tools/assistant-tools.js';
import ConfigManager from '../../config/index.js';

export class PersonalAssistantAgent extends BaseAgent {
  private availableAgents: Map<string, any> = new Map();

  constructor() {
    const config = ConfigManager.getAgentConfig('personalAssistant');
    
    const options: BaseAgentOptions = {
      name: 'personal-assistant',
      description: 'Main coordinator agent that handles task analysis, delegation, and high-level planning',
      config,
      instructions: `You are the Personal Assistant Agent, the primary coordinator in the AI Master system. Your role is to receive user requests, analyze them, and either handle them directly or delegate to specialized agents.

**Core Responsibilities:**
- Receive and analyze all incoming user requests
- Determine the best approach for handling each task
- Delegate specialized tasks to appropriate agents
- Coordinate multi-step workflows
- Provide high-level planning and task breakdown
- Handle general inquiries and simple tasks directly

**Available Specialized Agents:**
- Coder Agent: For all software development, coding, debugging, file operations, and technical implementation tasks

**Your Decision-Making Process:**
1. **Analyze the Request**: Use the analyze_task tool to categorize the request and determine complexity
2. **Plan the Approach**: For complex tasks, use create_task_plan to break them down
3. **Delegate or Handle**: 
   - Delegate coding/technical tasks to the Coder Agent
   - Handle general questions, planning, and coordination yourself
4. **Monitor and Coordinate**: Track progress and provide updates

**When to Delegate to Coder Agent:**
- Code generation, modification, or analysis
- File system operations (create, modify, delete files/directories)
- Shell command execution
- Debugging and troubleshooting
- Project setup and configuration
- Testing and validation
- Any technical implementation work

**What You Handle Directly:**
- General questions and conversations
- Task planning and strategy
- Information gathering and analysis
- Coordination between multiple agents
- Progress tracking and reporting
- Simple file reading for analysis

**Available Tools:**
- read_file: Read files for analysis (read-only access)
- list_directory: Browse directory contents
- delegate_to_agent: Send tasks to specialized agents
- analyze_task: Analyze task complexity and requirements
- create_task_plan: Break down complex tasks into steps

**Communication Style:**
- Be helpful, professional, and clear
- Always explain your decision-making process
- Provide context when delegating tasks
- Give progress updates for multi-step processes
- Ask clarifying questions when requests are ambiguous

**Important Guidelines:**
1. Always analyze tasks before acting or delegating
2. For any coding or file modification requests, delegate to the Coder Agent
3. Break down complex requests into manageable steps
4. Provide clear instructions when delegating
5. Monitor and coordinate the overall workflow
6. Be transparent about what you're doing and why

Remember: You are the orchestrator. Your job is to understand what the user needs and ensure it gets done effectively, whether by you or by delegating to the right specialist.`,
      tools: assistantTools,
    };

    super(options);
  }

  /**
   * Register an available agent for delegation
   */
  registerAgent(name: string, agent: any) {
    this.availableAgents.set(name, agent);
    console.log(`[Personal Assistant] Registered agent: ${name}`);
  }

  /**
   * Get list of available agents
   */
  getAvailableAgents(): string[] {
    return Array.from(this.availableAgents.keys());
  }

  /**
   * Main method for handling user requests
   */
  async handleRequest(request: string, context?: any) {
    console.log(`[Personal Assistant] Received request: ${request.substring(0, 100)}...`);
    
    try {
      // Analyze the task first
      const analysisPrompt = `
Analyze this user request and determine the best approach:

Request: "${request}"

Please:
1. Categorize the request type
2. Determine if delegation is needed
3. Identify which agent(s) should handle it
4. Create a plan if it's a complex multi-step task

Use the analyze_task and create_task_plan tools as appropriate.
`;

      const response = await this.executeTask(analysisPrompt, context);
      return response;
    } catch (error) {
      console.error(`[Personal Assistant] Error handling request:`, error);
      throw error;
    }
  }

  /**
   * Delegate a task to a specific agent
   */
  async delegateTask(agentName: string, task: string, context?: any) {
    const agent = this.availableAgents.get(agentName);
    
    if (!agent) {
      throw new Error(`Agent '${agentName}' is not available. Available agents: ${this.getAvailableAgents().join(', ')}`);
    }

    console.log(`[Personal Assistant] Delegating to ${agentName}: ${task.substring(0, 100)}...`);
    
    try {
      const result = await agent.executeTask(task, context);
      console.log(`[Personal Assistant] Task completed by ${agentName}`);
      return {
        delegatedTo: agentName,
        task,
        result,
        success: true,
      };
    } catch (error) {
      console.error(`[Personal Assistant] Delegation to ${agentName} failed:`, error);
      return {
        delegatedTo: agentName,
        task,
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Handle a multi-step workflow
   */
  async executeWorkflow(steps: any[], context?: any) {
    const results = [];
    
    console.log(`[Personal Assistant] Executing workflow with ${steps.length} steps`);
    
    for (const [index, step] of steps.entries()) {
      console.log(`[Personal Assistant] Executing step ${index + 1}/${steps.length}: ${step.action}`);
      
      try {
        let result;
        
        if (step.agent === 'personal-assistant') {
          // Handle this step ourselves
          result = await this.executeTask(step.action, context);
        } else {
          // Delegate to the specified agent
          result = await this.delegateTask(step.agent, step.action, context);
        }
        
        results.push({
          step: step.step,
          action: step.action,
          agent: step.agent,
          result,
          success: true,
        });
        
        // Update context with results for subsequent steps
        if (context) {
          context.previousSteps = results;
        }
        
      } catch (error) {
        console.error(`[Personal Assistant] Step ${index + 1} failed:`, error);
        results.push({
          step: step.step,
          action: step.action,
          agent: step.agent,
          error: error.message,
          success: false,
        });
        
        // Decide whether to continue or stop on error
        break;
      }
    }
    
    return {
      workflow: steps,
      results,
      completedSteps: results.filter(r => r.success).length,
      totalSteps: steps.length,
      success: results.every(r => r.success),
    };
  }

  /**
   * Provide status update on the system
   */
  async getSystemStatus() {
    const availableAgents = this.getAvailableAgents();
    const agentStatuses = {};
    
    // Check health of all registered agents
    for (const [name, agent] of this.availableAgents) {
      try {
        const isHealthy = await agent.healthCheck();
        agentStatuses[name] = {
          available: true,
          healthy: isHealthy,
          config: agent.getStatus(),
        };
      } catch (error) {
        agentStatuses[name] = {
          available: false,
          healthy: false,
          error: error.message,
        };
      }
    }
    
    return {
      personalAssistant: {
        status: 'online',
        config: this.getStatus(),
      },
      agents: agentStatuses,
      totalAgents: availableAgents.length,
      healthyAgents: Object.values(agentStatuses).filter((status: any) => status.healthy).length,
    };
  }
}

export default PersonalAssistantAgent;