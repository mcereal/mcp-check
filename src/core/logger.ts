/**
 * Logging implementation for mcp-check
 */

import { Logger, LogLevel } from '../types/reporting';

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  private context: Record<string, any> = {};

  constructor(
    private level: LogLevel = 'info',
    private enableColors: boolean = true,
  ) {}

  debug(message: string, meta?: any): void {
    if (this.shouldLog('debug')) {
      this.log('debug', message, meta);
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      this.log('info', message, meta);
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      this.log('warn', message, meta);
    }
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog('error')) {
      this.log('error', message, meta);
    }
  }

  child(context: Record<string, any>): Logger {
    const childLogger = new ConsoleLogger(this.level, this.enableColors);
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.level);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  private log(level: LogLevel, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const prefix = this.formatPrefix(level, timestamp);
    const contextStr =
      Object.keys(this.context).length > 0
        ? ` [${Object.entries(this.context)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')}]`
        : '';

    let output = `${prefix}${contextStr} ${message}`;

    if (meta) {
      if (typeof meta === 'object') {
        output += ` ${JSON.stringify(meta, null, 2)}`;
      } else {
        output += ` ${meta}`;
      }
    }

    // Write to appropriate stream
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(output + '\n');
  }

  private formatPrefix(level: LogLevel, timestamp: string): string {
    if (!this.enableColors) {
      return `[${timestamp}] [${level.toUpperCase()}]`;
    }

    const colors = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m', // green
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
    };

    const reset = '\x1b[0m';
    const color = colors[level];

    return `\x1b[90m[${timestamp}]\x1b[0m ${color}[${level.toUpperCase()}]${reset}`;
  }
}

/**
 * Create a logger with the specified configuration
 */
export function createLogger(
  level: LogLevel = 'info',
  enableColors: boolean = true,
): Logger {
  return new ConsoleLogger(level, enableColors);
}
