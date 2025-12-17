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

  private createMalformedJson(message: any): string | object {
    // Create actual malformed JSON that will fail parsing or violate JSON-RPC
    const malformations = [
      // Return a raw string that is invalid JSON (will cause parse errors on receiving end)
      () => this.createTruncatedJson(message),
      // Return JSON with invalid syntax
      () => this.createSyntaxErrorJson(message),
      // Return JSON with invalid UTF-8 sequences (as string marker)
      () => this.createInvalidEncodingMarker(message),
      // Return object with NaN/Infinity (invalid JSON values)
      () => this.createInvalidJsonValues(message),
      // Return JSON missing required JSON-RPC fields
      () => this.createIncompleteJsonRpc(message),
    ];

    const malformation = malformations[this.random.nextInt(0, malformations.length)];
    try {
      return malformation();
    } catch (error) {
      // If malformation fails, return original
      return message;
    }
  }

  private createTruncatedJson(message: any): string {
    // Create truncated JSON string that will fail to parse
    const jsonStr = JSON.stringify(message);
    const truncateAt = this.random.nextInt(1, Math.max(2, jsonStr.length - 5));
    return jsonStr.substring(0, truncateAt);
  }

  private createSyntaxErrorJson(message: any): string {
    // Create JSON with syntax errors
    const syntaxErrors = [
      () => {
        // Missing closing brace
        const json = JSON.stringify(message);
        return json.replace(/}$/, '');
      },
      () => {
        // Missing quotes around string value
        const json = JSON.stringify(message);
        return json.replace(/"([^"]+)"/g, (match, group, offset) => {
          // Only unquote some strings randomly
          if (this.random.nextBoolean(0.3)) {
            return group;
          }
          return match;
        });
      },
      () => {
        // Double comma
        const json = JSON.stringify(message);
        return json.replace(',', ',,');
      },
      () => {
        // Missing colon
        const json = JSON.stringify(message);
        return json.replace(':', '');
      },
      () => {
        // Trailing comma (invalid in JSON)
        const json = JSON.stringify(message);
        return json.replace(/}$/, ',}');
      },
    ];
    return syntaxErrors[this.random.nextInt(0, syntaxErrors.length)]();
  }

  private createInvalidEncodingMarker(message: any): object {
    // Return object with a marker string containing invalid byte sequences
    // These won't actually corrupt bytes but will indicate encoding issues
    return {
      ...message,
      _chaosEncoding: '\uFFFD\uFFFE\uFFFF', // Invalid Unicode replacement chars
      _corrupted: true,
    };
  }

  private createInvalidJsonValues(message: any): object {
    // JSON doesn't support NaN, Infinity, -Infinity, or undefined
    // Return object that will serialize to null for these
    const invalidValues = [NaN, Infinity, -Infinity];
    const value = invalidValues[this.random.nextInt(0, invalidValues.length)];
    return {
      ...message,
      _invalidValue: value,
    };
  }

  private createIncompleteJsonRpc(message: any): object {
    // Return JSON-RPC message missing required fields
    const incomplete = JSON.parse(JSON.stringify(message));
    const fieldsToRemove = ['jsonrpc', 'id', 'method', 'params'];
    const fieldToRemove = fieldsToRemove[this.random.nextInt(0, fieldsToRemove.length)];
    delete incomplete[fieldToRemove];
    return incomplete;
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
