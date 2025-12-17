/**
 * Protocol chaos plugin - simulates MCP protocol-level disruptions
 */

import { ChaosPlugin, ChaosContext, ProtocolChaosConfig } from '../types/chaos';
import { MCPPseudoRandom } from './random';

/**
 * Simulates MCP protocol-level chaos like malformed JSON, unexpected messages, etc.
 */
export class ProtocolChaosPlugin implements ChaosPlugin {
  readonly name = 'protocol-chaos';
  readonly description = 'Simulates MCP protocol violations and edge cases';
  enabled = true;

  private config: ProtocolChaosConfig;
  private context?: ChaosContext;
  private random: MCPPseudoRandom;

  constructor(config: ProtocolChaosConfig = {}) {
    this.config = {
      injectAbortProbability: 0.005,
      malformedJsonProbability: 0.001,
      unexpectedMessageProbability: 0.01,
      invalidSchemaProbability: 0.005,
      ...config,
    };
    this.random = new MCPPseudoRandom();
  }

  async initialize(context: ChaosContext): Promise<void> {
    this.context = context;
    this.random = new MCPPseudoRandom(context.seed);

    context.logger.debug('Protocol chaos plugin initialized', {
      config: this.config,
    });
  }

  async beforeSend(message: any): Promise<any> {
    if (!this.context || !this.shouldApplyChaos()) {
      return message;
    }

    // Inject unexpected abort
    if (
      this.config.injectAbortProbability &&
      this.random.nextBoolean(this.config.injectAbortProbability)
    ) {
      this.context.logger.debug('Protocol chaos: injecting abort');
      throw new Error('Protocol chaos: simulated connection abort');
    }

    // Inject malformed JSON
    if (
      this.config.malformedJsonProbability &&
      this.random.nextBoolean(this.config.malformedJsonProbability)
    ) {
      this.context.logger.debug('Protocol chaos: injecting malformed JSON');
      return this.createMalformedJson(message);
    }

    // Inject unexpected message type
    if (
      this.config.unexpectedMessageProbability &&
      this.random.nextBoolean(this.config.unexpectedMessageProbability)
    ) {
      this.context.logger.debug('Protocol chaos: injecting unexpected message');
      return this.createUnexpectedMessage(message);
    }

    // Inject schema violations
    if (
      this.config.invalidSchemaProbability &&
      this.random.nextBoolean(this.config.invalidSchemaProbability)
    ) {
      this.context.logger.debug('Protocol chaos: injecting schema violation');
      return this.createSchemaViolation(message);
    }

    return message;
  }

  async afterReceive(message: any): Promise<any> {
    if (!this.context || !this.shouldApplyChaos()) {
      return message;
    }

    // Randomly corrupt received messages
    if (
      this.config.malformedJsonProbability &&
      this.random.nextBoolean(this.config.malformedJsonProbability)
    ) {
      this.context.logger.debug('Protocol chaos: corrupting received message');
      return this.createMalformedJson(message);
    }

    return message;
  }

  async restore(): Promise<void> {
    if (this.context) {
      this.context.logger.debug('Protocol chaos plugin restored');
    }
  }

  private shouldApplyChaos(): boolean {
    return this.random.nextBoolean(0.05); // 5% base chance
  }

  private createMalformedJson(message: any): any {
    if (typeof message === 'object') {
      // Create various types of malformed JSON
      const malformations = [
        () => ({ ...message, '': 'invalid_empty_key' }),
        () => ({ ...message, [Symbol('invalid')]: 'symbol_key' }),
        () => ({ ...message, circular: message }), // Circular reference
        () => ({ ...message, undefined: undefined }),
        () => ({ ...message, function: () => {} }),
      ];

      const malformation =
        malformations[this.random.nextInt(0, malformations.length)];
      try {
        return malformation();
      } catch (error) {
        // If malformation fails, return original
        return message;
      }
    }

    return message;
  }

  private createUnexpectedMessage(message: any): any {
    // Create unexpected MCP message types
    const unexpectedMessages = [
      {
        jsonrpc: '2.0',
        method: 'chaos/unexpected',
        params: { chaos: true },
        id: this.random.nextInt(1000, 9999),
      },
      {
        jsonrpc: '2.0',
        result: { chaos: 'unexpected_result' },
        id: this.random.nextInt(1000, 9999),
      },
      {
        jsonrpc: '3.0', // Wrong version
        method: 'initialize',
        params: message.params,
        id: message.id,
      },
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Chaos injected error',
          data: { originalMessage: message },
        },
        id: message.id,
      },
    ];

    return unexpectedMessages[
      this.random.nextInt(0, unexpectedMessages.length)
    ];
  }

  private createSchemaViolation(message: any): any {
    if (typeof message !== 'object' || !message) {
      return message;
    }

    const violated = JSON.parse(JSON.stringify(message));

    // Various schema violations
    const violations = [
      () => {
        delete violated.jsonrpc; // Missing required field
        return violated;
      },
      () => {
        violated.jsonrpc = '1.0'; // Wrong version
        return violated;
      },
      () => {
        violated.id = 'invalid_id'; // Wrong type for ID
        return violated;
      },
      () => {
        if (violated.params) {
          violated.params = 'invalid_params'; // Wrong type for params
        }
        return violated;
      },
      () => {
        violated.extraField = 'should_not_be_here'; // Extra fields
        return violated;
      },
    ];

    const violation = violations[this.random.nextInt(0, violations.length)];
    return violation();
  }
}
