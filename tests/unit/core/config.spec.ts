/**
 * Comprehensive unit tests for configuration handling
 */

import { resolveConfig, validateConfig, loadConfig } from '../../../src/core/config';
import { CheckConfig, ResolvedCheckConfig } from '../../../src/types/config';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock fs for some tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

describe('Configuration Handling', () => {
  const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
  const mockExistsSync = require('fs').existsSync as jest.MockedFunction<typeof require('fs').existsSync>;

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateConfig', () => {
    it('should validate minimal valid configuration', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate stdio target configuration', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server',
          args: ['--port', '8080'],
          env: { NODE_ENV: 'test' },
          cwd: '/tmp',
          shell: true
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate TCP target configuration', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'tcp',
          host: 'localhost',
          port: 8080,
          tls: true,
          timeout: 10000
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate WebSocket target configuration', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'websocket',
          url: 'wss://example.com:8080/mcp',
          headers: { 'Authorization': 'Bearer token' },
          protocols: ['mcp-v1']
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should reject configuration without target', () => {
      const config = {
        $schema: 'test-schema',
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        }
      } as any;

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Target configuration is required');
    });

    it('should reject configuration without suites', () => {
      const config = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        reporting: {
          formats: ['json']
        }
      } as any;

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one test suite must be specified');
    });

    it('should reject empty suites array', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: [],
        reporting: {
          formats: ['json']
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one test suite must be specified');
    });

    it('should reject invalid suite names', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake', 'invalid-suite'],
        reporting: {
          formats: ['json']
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown test suite: invalid-suite');
    });

    it('should reject configuration without reporting', () => {
      const config = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake']
      } as any;

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Reporting configuration is required');
    });

    it('should reject empty reporting formats', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: []
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one reporting format must be specified');
    });

    it('should reject invalid reporting formats', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json', 'invalid-format']
        }
      } as any;

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown reporting format: invalid-format');
    });

    it('should validate chaos configuration', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        },
        chaos: {
          enable: true,
          scenarios: ['network', 'protocol'],
          failureRate: 0.1,
          networkLatency: {
            min: 10,
            max: 1000
          }
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid chaos failure rate', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        },
        chaos: {
          enable: true,
          failureRate: 1.5 // Invalid > 1.0
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chaos failure rate must be between 0 and 1');
    });

    it('should validate tool expectations', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        },
        expectations: {
          tools: [
            {
              name: 'test-tool',
              required: true,
              description: 'A test tool',
              inputSchemaRef: 'schemas/test-tool.json',
              outputSchemaRef: 'schemas/test-tool-output.json'
            }
          ]
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate resource expectations', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        },
        expectations: {
          resources: [
            {
              uri: 'file://test.txt',
              name: 'Test Resource',
              description: 'A test resource',
              mimeType: 'text/plain'
            }
          ]
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate parallelism configuration', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        },
        parallelism: {
          max: 4,
          perSuite: 2
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should provide warnings for potential issues', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        },
        expectations: {
          tools: [] // Empty tools array might be intentional but worth warning
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('No tool expectations defined - tests may be limited');
    });
  });

  describe('resolveConfig', () => {
    it('should resolve minimal configuration with defaults', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        }
      };

      const resolved = resolveConfig(config);

      expect(resolved.chaos).toEqual({ enable: false });
      expect(resolved.reporting.outputDir).toBeDefined();
      expect(resolved.parallelism).toEqual({ max: 1 });
    });

    it('should preserve provided configuration values', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake', 'tool-discovery'],
        reporting: {
          formats: ['json', 'junit'],
          outputDir: './custom-reports'
        },
        chaos: {
          enable: true,
          failureRate: 0.2
        },
        parallelism: {
          max: 4
        }
      };

      const resolved = resolveConfig(config);

      expect(resolved.suites).toEqual(['handshake', 'tool-discovery']);
      expect(resolved.reporting.outputDir).toBe('./custom-reports');
      expect(resolved.chaos.enable).toBe(true);
      expect(resolved.chaos.failureRate).toBe(0.2);
      expect(resolved.parallelism.max).toBe(4);
    });

    it('should merge expectations properly', () => {
      const config: CheckConfig = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        },
        expectations: {
          tools: [{ name: 'test-tool', required: true }],
          minProtocolVersion: '2024-11-05'
        }
      };

      const resolved = resolveConfig(config);

      expect(resolved.expectations?.tools).toHaveLength(1);
      expect(resolved.expectations?.minProtocolVersion).toBe('2024-11-05');
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from file', () => {
      const config = {
        $schema: 'test-schema',
        target: {
          type: 'stdio',
          command: 'test-server'
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json']
        }
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const loaded = loadConfig('/path/to/config.json');

      expect(loaded).toEqual(config);
      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/config.json', 'utf8');
    });

    it('should throw error for non-existent file', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => loadConfig('/path/to/non-existent.json')).toThrow(
        'Configuration file not found: /path/to/non-existent.json'
      );
    });

    it('should handle JSON parsing errors', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');

      expect(() => loadConfig('/path/to/invalid.json')).toThrow(
        'Failed to parse configuration file'
      );
    });

    it('should validate loaded configuration', () => {
      const invalidConfig = {
        // Missing required fields
        $schema: 'test-schema'
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadConfig('/path/to/invalid.json')).toThrow(
        'Configuration validation failed'
      );
    });
  });

  describe('Configuration Examples', () => {
    it('should validate real-world stdio configuration', () => {
      const config: CheckConfig = {
        $schema: 'https://schema.mcp-check.dev/config.json',
        target: {
          type: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-everything'],
          env: {
            NODE_ENV: 'test'
          }
        },
        suites: ['handshake', 'tool-discovery', 'tool-invocation'],
        reporting: {
          formats: ['json', 'junit', 'html'],
          outputDir: './test-reports'
        },
        expectations: {
          tools: [
            { name: 'echo', required: true },
            { name: 'add', required: true },
            { name: 'longRunningOperation', required: false }
          ],
          minProtocolVersion: '2024-11-05'
        },
        chaos: {
          enable: false
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate real-world WebSocket configuration', () => {
      const config: CheckConfig = {
        $schema: 'https://schema.mcp-check.dev/config.json',
        target: {
          type: 'websocket',
          url: 'wss://api.example.com/mcp',
          headers: {
            'Authorization': 'Bearer ${MCP_API_TOKEN}',
            'User-Agent': 'mcp-check/1.0.0'
          }
        },
        suites: ['handshake', 'streaming'],
        reporting: {
          formats: ['json', 'badge'],
          outputDir: './reports'
        },
        chaos: {
          enable: true,
          scenarios: ['network'],
          failureRate: 0.05,
          networkLatency: {
            min: 50,
            max: 500
          }
        },
        parallelism: {
          max: 1
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate comprehensive TCP configuration', () => {
      const config: CheckConfig = {
        $schema: 'https://schema.mcp-check.dev/config.json',
        target: {
          type: 'tcp',
          host: 'localhost',
          port: 8080,
          tls: true,
          timeout: 30000
        },
        suites: ['handshake', 'tool-discovery', 'tool-invocation', 'streaming'],
        reporting: {
          formats: ['json', 'junit', 'html', 'badge'],
          outputDir: './comprehensive-reports'
        },
        expectations: {
          tools: [
            {
              name: 'calculator',
              required: true,
              description: 'Mathematical calculator',
              inputSchemaRef: './schemas/calculator-input.json'
            },
            {
              name: 'file-reader',
              required: true,
              description: 'File system reader'
            }
          ],
          resources: [
            {
              uri: 'file://readme.md',
              name: 'README',
              description: 'Project documentation'
            }
          ],
          minProtocolVersion: '2024-11-05'
        },
        chaos: {
          enable: true,
          scenarios: ['network', 'protocol', 'timing'],
          failureRate: 0.1,
          networkLatency: {
            min: 10,
            max: 2000
          }
        },
        parallelism: {
          max: 3,
          perSuite: 2
        }
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });
});
