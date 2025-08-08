/**
 * Stream chaos plugin - simulates streaming-level disruptions
 */

import { ChaosPlugin, ChaosContext, StreamChaosConfig } from '../types/chaos';
import { MCPPseudoRandom } from './random';

/**
 * Simulates streaming-level chaos like chunk reordering, duplication, etc.
 */
export class StreamChaosPlugin implements ChaosPlugin {
  readonly name = 'stream-chaos';
  readonly description =
    'Simulates streaming data disruptions and chunk manipulation';
  enabled = true;

  private config: StreamChaosConfig;
  private context?: ChaosContext;
  private random: MCPPseudoRandom;
  private messageBuffer: Array<{ message: any; timestamp: number }> = [];

  constructor(config: StreamChaosConfig = {}) {
    this.config = {
      chunkJitterMs: [0, 50],
      reorderProbability: 0.01,
      duplicateChunkProbability: 0.005,
      splitChunkProbability: 0.01,
      ...config,
    };
    this.random = new MCPPseudoRandom();
  }

  async initialize(context: ChaosContext): Promise<void> {
    this.context = context;
    this.random = new MCPPseudoRandom(context.seed);

    context.logger.debug('Stream chaos plugin initialized', {
      config: this.config,
    });
  }

  async beforeSend(message: any): Promise<any> {
    if (!this.context || !this.shouldApplyChaos()) {
      return message;
    }

    // Apply chunk jitter (delay)
    if (this.config.chunkJitterMs) {
      const [min, max] = this.config.chunkJitterMs;
      const jitter = this.random.nextInt(min, max);
      if (jitter > 0) {
        this.context.logger.debug(`Stream chaos: applying ${jitter}ms jitter`);
        await this.sleep(jitter);
      }
    }

    // Split large messages into chunks
    if (
      this.config.splitChunkProbability &&
      this.random.nextBoolean(this.config.splitChunkProbability)
    ) {
      this.context.logger.debug('Stream chaos: splitting message into chunks');
      return this.splitMessage(message);
    }

    // Duplicate chunks
    if (
      this.config.duplicateChunkProbability &&
      this.random.nextBoolean(this.config.duplicateChunkProbability)
    ) {
      this.context.logger.debug('Stream chaos: duplicating chunk');
      // Schedule duplicate after delay
      setTimeout(async () => {
        try {
          const delay = this.random.nextInt(10, 100);
          await this.sleep(delay);
          this.context!.logger.debug(
            'Stream chaos: would send duplicate chunk',
          );
          // In real implementation, would send duplicate through transport
        } catch (error) {
          // Ignore errors in duplicate sending
        }
      }, 0);
    }

    // Reorder messages
    if (
      this.config.reorderProbability &&
      this.random.nextBoolean(this.config.reorderProbability)
    ) {
      this.context.logger.debug(
        'Stream chaos: adding message to reorder buffer',
      );
      this.messageBuffer.push({ message, timestamp: Date.now() });

      // Randomly release buffered messages
      if (this.messageBuffer.length >= 2 && this.random.nextBoolean(0.5)) {
        const index = this.random.nextInt(0, this.messageBuffer.length);
        const buffered = this.messageBuffer.splice(index, 1)[0];
        this.context.logger.debug('Stream chaos: releasing reordered message');
        return buffered.message;
      }

      // Return null to buffer this message (simulate reordering)
      return null;
    }

    return message;
  }

  async afterReceive(message: any): Promise<any> {
    if (!this.context || !this.shouldApplyChaos()) {
      return message;
    }

    // Apply receive jitter
    if (this.config.chunkJitterMs) {
      const [min, max] = this.config.chunkJitterMs;
      const jitter = this.random.nextInt(min, max);
      if (jitter > 0) {
        this.context.logger.debug(
          `Stream chaos: applying receive ${jitter}ms jitter`,
        );
        await this.sleep(jitter);
      }
    }

    return message;
  }

  async restore(): Promise<void> {
    if (this.context) {
      this.context.logger.debug('Stream chaos plugin restored');

      // Release any buffered messages
      if (this.messageBuffer.length > 0) {
        this.context.logger.debug(
          `Releasing ${this.messageBuffer.length} buffered messages`,
        );
        this.messageBuffer = [];
      }
    }
  }

  private shouldApplyChaos(): boolean {
    return this.random.nextBoolean(0.05); // 5% base chance
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private splitMessage(message: any): any {
    // For demonstration, we'll simulate splitting by adding metadata
    // In a real implementation, this would depend on the transport layer
    if (typeof message === 'object' && message !== null) {
      return {
        ...message,
        _chaos_split: true,
        _chaos_chunk_id: this.random.nextInt(1000, 9999),
        _chaos_total_chunks: this.random.nextInt(2, 5),
      };
    }

    return message;
  }

  /**
   * Flush any buffered messages (used for cleanup)
   */
  async flushBuffer(): Promise<any[]> {
    const messages = this.messageBuffer.map((item) => item.message);
    this.messageBuffer = [];
    return messages;
  }

  /**
   * Get current buffer size for monitoring
   */
  getBufferSize(): number {
    return this.messageBuffer.length;
  }
}
