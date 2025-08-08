/**
 * Basic unit tests to verify core functionality
 */

import { resolveConfig, validateConfig } from '../../src/core/config';
import { createLogger } from '../../src/core/logger';
import { CheckConfig } from '../../src/types/config';

describe('Basic Functionality Tests', () => {
  describe('Configuration', () => {
    it('should create a valid resolved configuration', () => {
      const basicConfig: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'echo',
          args: ['test'],
        },
      };

      const resolved = resolveConfig(basicConfig);

      expect(resolved).toBeDefined();
      expect(resolved.target.type).toBe('stdio');
      expect(resolved.version).toBeDefined();
      expect(resolved.environment).toBeDefined();
      expect(resolved.timeouts).toBeDefined();
      expect(resolved.reporting).toBeDefined();
    });

    it('should validate a basic configuration', () => {
      const config: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['test.js'],
        },
      };

      const validation = validateConfig(config);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });
  });

  describe('Logger', () => {
    it('should create a logger', () => {
      const logger = createLogger('info', false);
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
    });

    it('should create child logger with context', () => {
      const logger = createLogger('info', false);
      const childLogger = logger.child({ component: 'test' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  describe('Type System', () => {
    it('should accept different target types', () => {
      const stdioConfig: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      };

      const tcpConfig: CheckConfig = {
        target: {
          type: 'tcp',
          host: 'localhost',
          port: 8080,
        },
      };

      const wsConfig: CheckConfig = {
        target: {
          type: 'websocket',
          url: 'ws://localhost:8080',
        },
      };

      expect(validateConfig(stdioConfig).valid).toBe(true);
      expect(validateConfig(tcpConfig).valid).toBe(true);
      expect(validateConfig(wsConfig).valid).toBe(true);
    });
  });
});
