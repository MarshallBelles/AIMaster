#!/usr/bin/env node

/**
 * CLI interface for AI Master agents
 * Allows direct interaction with specific agents
 */

import { program } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { initializeAgents, personalAssistant, coderAgent, configManager } from '../mastra/index.js';

// CLI configuration
program
  .name('ai-master')
  .description('AI Master - Multi-agent system for task automation')
  .version('1.0.0');

// Command to interact with Personal Assistant
program
  .command('ask')
  .description('Ask the Personal Assistant (default agent)')
  .argument('<request>', 'Your request or question')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (request, options) => {
    try {
      console.log(chalk.blue('🤖 Personal Assistant Processing...'));
      
      if (options.verbose) {
        console.log(chalk.gray(`Request: ${request}`));
      }
      
      await ensureInitialized();
      const response = await personalAssistant.handleRequest(request);
      
      console.log(chalk.green('\n✅ Response:'));
      console.log(response.text || 'Task completed successfully');
      
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Command to interact directly with Coder Agent
program
  .command('code')
  .description('Direct interaction with the Coder Agent')
  .argument('<task>', 'Coding task or request')
  .option('-l, --language <lang>', 'Programming language (default: typescript)')
  .option('-f, --framework <framework>', 'Framework to use')
  .option('-t, --tests', 'Include tests in the output')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (task, options) => {
    try {
      console.log(chalk.cyan('⚡ Coder Agent Processing...'));
      
      if (options.verbose) {
        console.log(chalk.gray(`Task: ${task}`));
        console.log(chalk.gray(`Language: ${options.language || 'typescript'}`));
        if (options.framework) console.log(chalk.gray(`Framework: ${options.framework}`));
      }
      
      await ensureInitialized();
      
      const response = await coderAgent.generateCode(task, {
        language: options.language,
        framework: options.framework,
        includeTests: options.tests,
      });
      
      console.log(chalk.green('\n✅ Generated Code:'));
      console.log(response.text || 'Code generation completed');
      
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Command to debug code
program
  .command('debug')
  .description('Debug code with the Coder Agent')
  .argument('<file-or-code>', 'File path or code snippet to debug')
  .option('-e, --error <description>', 'Error description')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (fileOrCode, options) => {
    try {
      console.log(chalk.yellow('🔍 Debugging with Coder Agent...'));
      
      await ensureInitialized();
      const response = await coderAgent.debugCode(fileOrCode, options.error);
      
      console.log(chalk.green('\n✅ Debug Analysis:'));
      console.log(response.text || 'Debug analysis completed');
      
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Command to show system status
program
  .command('status')
  .description('Show system and agent status')
  .action(async () => {
    try {
      console.log(chalk.blue('📊 AI Master System Status\n'));
      
      await ensureInitialized();
      const status = await personalAssistant.getSystemStatus();
      
      // Display Personal Assistant status
      console.log(chalk.bold('Personal Assistant:'));
      console.log(`  Status: ${chalk.green(status.personalAssistant.status)}`);
      console.log(`  Model: ${status.personalAssistant.config.model}`);
      console.log(`  API URL: ${status.personalAssistant.config.apiUrl}\n`);
      
      // Display agent statuses
      console.log(chalk.bold('Specialized Agents:'));
      Object.entries(status.agents).forEach(([name, agentStatus]: [string, any]) => {
        const statusColor = agentStatus.healthy ? chalk.green : chalk.red;
        const healthIcon = agentStatus.healthy ? '✅' : '❌';
        
        console.log(`  ${healthIcon} ${name}:`);
        console.log(`    Healthy: ${statusColor(agentStatus.healthy ? 'Yes' : 'No')}`);
        console.log(`    Model: ${agentStatus.config?.model || 'N/A'}`);
        console.log(`    API URL: ${agentStatus.config?.apiUrl || 'N/A'}`);
        if (agentStatus.error) {
          console.log(`    Error: ${chalk.red(agentStatus.error)}`);
        }
        console.log();
      });
      
      console.log(chalk.bold('Summary:'));
      console.log(`  Total Agents: ${status.totalAgents}`);
      console.log(`  Healthy Agents: ${status.healthyAgents}/${status.totalAgents}`);
      
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    try {
      await ensureInitialized();
      await runInteractiveMode();
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Configuration management
program
  .command('config')
  .description('Manage configuration')
  .option('-s, --show', 'Show current configuration')
  .option('-r, --reload', 'Reload configuration from file')
  .action(async (options) => {
    try {
      if (options.show) {
        const config = configManager.getConfig();
        console.log(chalk.blue('📋 Current Configuration:'));
        console.log(JSON.stringify(config, null, 2));
      }
      
      if (options.reload) {
        await configManager.loadConfig();
        console.log(chalk.green('✅ Configuration reloaded'));
      }
      
      if (!options.show && !options.reload) {
        console.log(chalk.yellow('Use --show to display config or --reload to reload from file'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Interactive mode implementation
async function runInteractiveMode() {
  console.log(chalk.bold.cyan('\n🤖 AI Master Interactive Mode\n'));
  console.log(chalk.gray('Type "exit" to quit, "help" for commands\n'));
  
  while (true) {
    try {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '💬 Ask Personal Assistant', value: 'ask' },
            { name: '⚡ Request Coder Agent', value: 'code' },
            { name: '🔍 Debug Code', value: 'debug' },
            { name: '📊 System Status', value: 'status' },
            { name: '🚪 Exit', value: 'exit' },
          ],
        },
      ]);
      
      if (action === 'exit') {
        console.log(chalk.yellow('\n👋 Goodbye!'));
        break;
      }
      
      if (action === 'status') {
        const status = await personalAssistant.getSystemStatus();
        console.log(chalk.blue('\n📊 System Status:'));
        console.log(`Healthy Agents: ${status.healthyAgents}/${status.totalAgents}`);
        continue;
      }
      
      const { input } = await inquirer.prompt([
        {
          type: 'input',
          name: 'input',
          message: action === 'ask' ? 'Your request:' : action === 'code' ? 'Coding task:' : 'File/code to debug:',
          validate: (value) => value.trim().length > 0 || 'Please enter a request',
        },
      ]);
      
      console.log(chalk.blue('\n🔄 Processing...'));
      
      let response;
      switch (action) {
        case 'ask':
          response = await personalAssistant.handleRequest(input);
          break;
        case 'code':
          response = await coderAgent.generateCode(input);
          break;
        case 'debug':
          response = await coderAgent.debugCode(input);
          break;
      }
      
      console.log(chalk.green('\n✅ Response:'));
      console.log(response.text || 'Task completed successfully');
      console.log(chalk.gray('\n' + '─'.repeat(50) + '\n'));
      
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.log(chalk.gray('\n' + '─'.repeat(50) + '\n'));
    }
  }
}

// Utility function to ensure agents are initialized
let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    console.log(chalk.gray('Initializing agents...'));
    await initializeAgents();
    initialized = true;
  }
}

// Parse CLI arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}