/**
 * Chaos engineering types and interfaces
 */

/**
 * Chaos injection context
 */
export interface ChaosContext {
  transport: import('./transport').Transport;
  config: ChaosConfig;
  logger: import('./reporting').Logger;
  seed: number;
}

/**
 * Result from a plugin's beforeSend method
 */
export interface PluginSendResult {
  /** The modified message (null if dropped) */
  message: any | null;
  /** Duplicate messages to send with delays */
  duplicates?: Array<{ message: any; delayMs: number }>;
}

/**
 * Chaos plugin interface
 */
export interface ChaosPlugin {
  name: string;
  description: string;
  enabled: boolean;

  /**
   * Initialize the chaos plugin
   */
  initialize(context: ChaosContext): Promise<void>;

  /**
   * Inject chaos before message send
   * Can return either a modified message (any) or a PluginSendResult with duplicates
   */
  beforeSend?(message: any): Promise<any | PluginSendResult>;

  /**
   * Inject chaos after message receive
   */
  afterReceive?(message: any): Promise<any>;

  /**
   * Inject chaos during connection
   */
  duringConnection?(): Promise<void>;

  /**
   * Clean up and restore normal operation
   */
  restore(): Promise<void>;
}

/**
 * Network chaos configuration
 */
export interface NetworkChaosConfig {
  delayMs?: [number, number];
  dropProbability?: number;
  duplicateProbability?: number;
  reorderProbability?: number;
  corruptProbability?: number;
}

/**
 * Stream chaos configuration
 */
export interface StreamChaosConfig {
  chunkJitterMs?: [number, number];
  reorderProbability?: number;
  duplicateChunkProbability?: number;
  splitChunkProbability?: number;
}

/**
 * Protocol chaos configuration
 */
export interface ProtocolChaosConfig {
  injectAbortProbability?: number;
  malformedJsonProbability?: number;
  unexpectedMessageProbability?: number;
  invalidSchemaProbability?: number;
}

/**
 * Timing chaos configuration
 */
export interface TimingChaosConfig {
  clockSkewMs?: [number, number];
  processingDelayMs?: [number, number];
  timeoutReductionFactor?: number;
}

/**
 * Complete chaos configuration
 */
export interface ChaosConfig {
  enable?: boolean;
  seed?: number;
  network?: NetworkChaosConfig;
  stream?: StreamChaosConfig;
  protocol?: ProtocolChaosConfig;
  timing?: TimingChaosConfig;
  intensity?: number; // 0.0 to 1.0
}

/**
 * Result of chaos application, may include duplicates to send
 */
export interface ChaosResult {
  /** The modified message (null if dropped) */
  message: any | null;
  /** Duplicate messages to send with delays */
  duplicates?: Array<{ message: any; delayMs: number }>;
}

/**
 * Chaos controller interface
 */
export interface ChaosController {
  readonly config: ChaosConfig;
  readonly plugins: ChaosPlugin[];

  /**
   * Initialize chaos controller
   */
  initialize(context: ChaosContext): Promise<void>;

  /**
   * Register a chaos plugin
   */
  register(plugin: ChaosPlugin): void;

  /**
   * Enable chaos injection
   */
  enable(): void;

  /**
   * Disable chaos injection
   */
  disable(): void;

  /**
   * Apply chaos to outgoing message
   * @returns ChaosResult with the modified message and any duplicates to send
   */
  applySendChaos(message: any): Promise<ChaosResult>;

  /**
   * Apply chaos to incoming message
   */
  applyReceiveChaos(message: any): Promise<any>;

  /**
   * Restore normal operation
   */
  restore(): Promise<void>;
}

/**
 * Pseudorandom number generator for reproducible chaos
 */
export interface PseudoRandom {
  next(): number;
  nextInt(min: number, max: number): number;
  nextFloat(min: number, max: number): number;
  nextBoolean(probability: number): boolean;
  shuffle<T>(array: T[]): T[];
}
