/**
 * Unit tests for configuration loading and validation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  loadConfig,
  validateConfig,
  resolveConfig,
  createDefaultConfig,
} from '../../src/core/config';
import { CheckConfig } from '../../src/types/config';
import { createTempDir, cleanupTempDir } from '../helpers/test-utils';

describe('Configuration Management', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('Configuration Validation', () => {
    it('should validate a valid configuration', () => {
      const config: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        expectations: {
          minProtocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        suites: ['handshake'],
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject configuration missing required target', () => {
      const config = {
        expectations: {
          minProtocolVersion: '2024-11-05',
        },
        suites: ['handshake'],
      } as any;

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('target'))).toBe(true);
    });

    it('should reject invalid target type', () => {
      const config = {
        target: {
          type: 'invalid',
          url: 'dummy', // Add required fields to avoid other validation errors
        },
      } as any;

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should validate stdio target configuration', () => {
      const config: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: { DEBUG: '1' },
          cwd: '/path/to/server',
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate TCP target configuration', () => {
      const config: CheckConfig = {
        target: {
          type: 'tcp',
          host: 'localhost',
          port: 8080,
          tls: true,
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate WebSocket target configuration', () => {
      const config: CheckConfig = {
        target: {
          type: 'websocket',
          url: 'ws://localhost:8080',
          headers: { Authorization: 'Bearer token' },
          protocols: ['mcp'],
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should reject TCP target with invalid port', () => {
      const config: CheckConfig = {
        target: {
          type: 'tcp',
          host: 'localhost',
          port: 70000, // Invalid port
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });
  });

  describe('Configuration Resolution', () => {
    it('should resolve configuration with defaults', () => {
      const config: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      };

      const resolved = resolveConfig(config);

      expect(resolved.timeouts.connectMs).toBeDefined();
      expect(resolved.timeouts.invokeMs).toBeDefined();
      expect(resolved.chaos.enable).toBeDefined();
      expect(resolved.reporting.formats).toBeDefined();
      expect(resolved.environment).toBeDefined();
      expect(resolved.version).toBeDefined();
    });

    it('should preserve user overrides', () => {
      const config: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        timeouts: {
          connectMs: 10000,
        },
        chaos: {
          enable: true,
          seed: 12345,
        },
      };

      const resolved = resolveConfig(config);

      expect(resolved.timeouts.connectMs).toBe(10000);
      expect(resolved.chaos.enable).toBe(true);
      expect(resolved.chaos.seed).toBe(12345);
    });

    it('should expand "all" suites to specific suite names', () => {
      const config: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        suites: 'all',
      };

      const resolved = resolveConfig(config);

      expect(Array.isArray(resolved.suites)).toBe(true);
      expect(resolved.suites.length).toBeGreaterThan(5);
      expect(resolved.suites).toContain('handshake');
      expect(resolved.suites).toContain('tool-discovery');
      expect(resolved.suites).toContain('tool-invocation');
    });
  });

  describe('Configuration File Loading', () => {
    it('should load configuration from JSON file', async () => {
      const configData: CheckConfig = {
        target: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        suites: ['handshake'],
      };

      const configPath = path.join(tempDir, 'test-config.json');
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

      const loaded = await loadConfig(configPath);
      expect(loaded.target.type).toBe('stdio');
      if (loaded.target.type === 'stdio') {
        expect(loaded.target.command).toBe('node');
      }
      expect(loaded.suites).toEqual(['handshake']);
    });

    it('should load configuration from package.json', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        'mcp-check': {
          target: {
            type: 'stdio',
            command: 'npm',
            args: ['run', 'server'],
          },
          suites: ['handshake', 'tool-discovery'],
        },
      };

      const packagePath = path.join(tempDir, 'package.json');
      fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

      const loaded = await loadConfig(packagePath);
      expect(loaded).toBeDefined();
      expect(loaded.target.type).toBe('stdio');
      if (loaded.target.type === 'stdio') {
        expect(loaded.target.command).toBe('npm');
      }
      expect(loaded.suites).toEqual(['handshake', 'tool-discovery']);
    });

    it('should throw error for non-existent config file', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.json');
      await expect(loadConfig(nonExistentPath)).rejects.toThrow(
        'Configuration file not found',
      );
    });

    it('should throw error for invalid JSON', async () => {
      const invalidJsonPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidJsonPath, '{ invalid json }');

      await expect(loadConfig(invalidJsonPath)).rejects.toThrow();
    });
  });

  describe('Default Configuration Creation', () => {
    it('should create a valid default configuration file', async () => {
      const outputPath = path.join(tempDir, 'default-config.json');
      await createDefaultConfig(outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);

      const loaded = await loadConfig(outputPath);
      expect(loaded.target).toBeDefined();
      expect(loaded.expectations).toBeDefined();
      expect(loaded.suites).toBeDefined();

      const validation = validateConfig(loaded);
      expect(validation.valid).toBe(true);
    });
  });
});
