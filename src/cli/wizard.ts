/**
 * Interactive configuration wizard for mcp-check
 */

import * as readline from 'readline';
import { colors } from './colors';
import { CheckConfig } from '../types/config';

interface WizardOptions {
  output: string;
}

/**
 * Create readline interface for prompts
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input with optional default value
 */
async function prompt(
  rl: readline.Interface,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const displayDefault = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${displayDefault}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Prompt user to select from options
 */
async function select(
  rl: readline.Interface,
  question: string,
  options: string[],
  defaultIndex = 0,
): Promise<string> {
  console.log(question);
  options.forEach((opt, i) => {
    const marker = i === defaultIndex ? colors.cyan('→') : ' ';
    console.log(`  ${marker} ${i + 1}. ${opt}`);
  });

  const answer = await prompt(rl, 'Enter number', String(defaultIndex + 1));
  const index = parseInt(answer, 10) - 1;

  if (index >= 0 && index < options.length) {
    return options[index];
  }
  return options[defaultIndex];
}

/**
 * Prompt user to select multiple options
 */
async function multiSelect(
  rl: readline.Interface,
  question: string,
  options: string[],
  defaults: string[] = [],
): Promise<string[]> {
  console.log(question);
  options.forEach((opt, i) => {
    const checked = defaults.includes(opt) ? colors.green('✓') : ' ';
    console.log(`  ${checked} ${i + 1}. ${opt}`);
  });

  const answer = await prompt(
    rl,
    'Enter numbers separated by commas',
    defaults.map((d) => String(options.indexOf(d) + 1)).join(','),
  );

  const indices = answer
    .split(',')
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < options.length);

  return indices.length > 0 ? indices.map((i) => options[i]) : defaults;
}

/**
 * Prompt user for yes/no
 */
async function confirm(
  rl: readline.Interface,
  question: string,
  defaultValue = false,
): Promise<boolean> {
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';
  const answer = await prompt(rl, `${question} (${defaultStr})`);
  if (answer === '') {
    return defaultValue;
  }
  return answer.toLowerCase().startsWith('y');
}

/**
 * Run the interactive configuration wizard
 */
export async function runWizard(options: WizardOptions): Promise<CheckConfig> {
  const rl = createReadline();

  console.log(colors.blue('\n🔧 MCP Check Configuration Wizard\n'));
  console.log(
    colors.gray(
      'This wizard will help you create a configuration file for testing your MCP server.',
    ),
  );
  console.log(
    colors.gray('Press Enter to accept default values shown in parentheses.\n'),
  );

  try {
    // Step 1: Transport type
    console.log(colors.yellow('\n📡 Step 1: Transport Configuration\n'));

    const transportType = await select(
      rl,
      'How does your MCP server communicate?',
      ['stdio (process)', 'tcp (network socket)', 'websocket'],
      0,
    );

    let target: CheckConfig['target'];

    if (transportType.startsWith('stdio')) {
      const command = await prompt(rl, 'Server command', 'node');
      const args = await prompt(rl, 'Server arguments (space-separated)', 'dist/server.js');
      const cwd = await prompt(rl, 'Working directory (optional)');

      target = {
        type: 'stdio',
        command,
        args: args.split(/\s+/).filter(Boolean),
        ...(cwd && { cwd }),
      };
    } else if (transportType.startsWith('tcp')) {
      const host = await prompt(rl, 'Server host', 'localhost');
      const port = await prompt(rl, 'Server port', '3000');
      const useTls = await confirm(rl, 'Use TLS?', false);

      target = {
        type: 'tcp',
        host,
        port: parseInt(port, 10),
        ...(useTls && { tls: true }),
      };
    } else {
      const url = await prompt(rl, 'WebSocket URL', 'ws://localhost:3000');

      target = {
        type: 'websocket',
        url,
      };
    }

    // Step 2: Expected capabilities
    console.log(colors.yellow('\n🎯 Step 2: Server Capabilities\n'));

    const capabilities = await multiSelect(
      rl,
      'What capabilities does your server support?',
      ['tools', 'resources', 'prompts', 'logging'],
      ['tools'],
    );

    const expectations: CheckConfig['expectations'] = {
      minProtocolVersion: '2024-11-05',
      capabilities,
    };

    // Step 3: Tools configuration
    if (capabilities.includes('tools')) {
      const addTools = await confirm(
        rl,
        'Do you want to specify expected tools?',
        false,
      );

      if (addTools) {
        expectations.tools = [];
        let addingTools = true;

        while (addingTools) {
          const toolName = await prompt(rl, 'Tool name');
          if (!toolName) break;

          const required = await confirm(rl, `Is "${toolName}" required?`, true);
          const description = await prompt(rl, 'Tool description (optional)');

          expectations.tools.push({
            name: toolName,
            required,
            ...(description && { description }),
          });

          addingTools = await confirm(rl, 'Add another tool?', false);
        }
      }
    }

    // Step 4: Test suites
    console.log(colors.yellow('\n🧪 Step 3: Test Suites\n'));

    const suites = await multiSelect(
      rl,
      'Which test suites do you want to run?',
      [
        'handshake',
        'tool-discovery',
        'tool-invocation',
        'streaming',
        'timeout',
        'large-payload',
      ],
      ['handshake', 'tool-discovery', 'tool-invocation'],
    );

    // Step 5: Timeouts
    console.log(colors.yellow('\n⏱️  Step 4: Timeouts\n'));

    const customTimeouts = await confirm(
      rl,
      'Do you want to customize timeouts?',
      false,
    );

    let timeouts: CheckConfig['timeouts'] | undefined;

    if (customTimeouts) {
      const connectMs = await prompt(rl, 'Connection timeout (ms)', '5000');
      const invokeMs = await prompt(rl, 'Tool invocation timeout (ms)', '10000');
      const shutdownMs = await prompt(rl, 'Shutdown timeout (ms)', '3000');

      timeouts = {
        connectMs: parseInt(connectMs, 10),
        invokeMs: parseInt(invokeMs, 10),
        shutdownMs: parseInt(shutdownMs, 10),
      };
    }

    // Step 6: Chaos engineering
    console.log(colors.yellow('\n🌪️  Step 5: Chaos Engineering\n'));

    const enableChaos = await confirm(
      rl,
      'Enable chaos engineering for resilience testing?',
      false,
    );

    let chaos: CheckConfig['chaos'] | undefined;

    if (enableChaos) {
      const intensity = await select(
        rl,
        'Select chaos intensity:',
        ['low', 'medium', 'high'],
        0,
      );

      const intensityValues: Record<string, number> = {
        low: 0.05,
        medium: 0.1,
        high: 0.3,
      };

      chaos = {
        enable: true,
        seed: Date.now(),
        intensity: intensityValues[intensity] || 0.05,
      };
    }

    // Step 7: Reporting
    console.log(colors.yellow('\n📊 Step 6: Reporting\n'));

    const formats = await multiSelect(
      rl,
      'Which report formats do you want?',
      ['json', 'html', 'junit', 'badge'],
      ['json', 'html'],
    );

    const outputDir = await prompt(rl, 'Reports output directory', './reports');

    const reporting: CheckConfig['reporting'] = {
      formats: formats as Array<'json' | 'html' | 'junit' | 'badge'>,
      outputDir,
      includeFixtures: true,
    };

    // Build final config
    const config: CheckConfig = {
      $schema: './schemas/mcp-check.config.schema.json',
      target,
      expectations,
      suites,
      ...(timeouts && { timeouts }),
      ...(chaos && { chaos }),
      reporting,
    };

    rl.close();

    // Summary
    console.log(colors.green('\n✅ Configuration Summary:\n'));
    console.log(colors.gray(JSON.stringify(config, null, 2)));

    return config;
  } catch (error) {
    rl.close();
    throw error;
  }
}
