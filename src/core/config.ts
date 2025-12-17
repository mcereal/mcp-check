/**
 * Configuration loading and validation utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';

/**
 * Get package version from package.json
 */
function getPackageVersion(): string {
  try {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
import {
  CheckConfig,
  ResolvedCheckConfig,
  ValidationResult,
} from '../types/config';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<CheckConfig> = {
  suites: ['handshake', 'tool-discovery', 'tool-invocation'],
  timeouts: {
    connectMs: 5000,
    invokeMs: 15000,
    shutdownMs: 3000,
    streamMs: 30000,
  },
  chaos: {
    enable: false,
    seed: Date.now(),
  },
  reporting: {
    formats: ['json', 'html'],
    outputDir: './reports',
    includeFixtures: true,
    redaction: {
      enabled: true,
    },
  },
  parallelism: {
    maxConcurrentTests: 1,
    maxConcurrentConnections: 1,
  },
};

/**
 * Configuration schema for validation
 */
const CONFIG_SCHEMA = {
  type: 'object',
  required: ['target'],
  properties: {
    $schema: { type: 'string' },
    target: {
      oneOf: [
        {
          type: 'object',
          required: ['type', 'command'],
          properties: {
            type: { const: 'stdio' },
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
            env: { type: 'object', additionalProperties: { type: 'string' } },
            cwd: { type: 'string' },
            shell: { type: 'boolean' },
          },
        },
        {
          type: 'object',
          required: ['type', 'host', 'port'],
          properties: {
            type: { const: 'tcp' },
            host: { type: 'string' },
            port: { type: 'integer', minimum: 1, maximum: 65535 },
            tls: { type: 'boolean' },
            timeout: { type: 'integer', minimum: 0 },
          },
        },
        {
          type: 'object',
          required: ['type', 'url'],
          properties: {
            type: { const: 'websocket' },
            url: { type: 'string' },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            protocols: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
    },
    expectations: {
      type: 'object',
      properties: {
        minProtocolVersion: { type: 'string' },
        maxProtocolVersion: { type: 'string' },
        capabilities: { type: 'array', items: { type: 'string' } },
        tools: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              required: { type: 'boolean' },
              inputSchemaRef: { type: 'string' },
              outputSchemaRef: { type: 'string' },
              description: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        resources: {
          type: 'array',
          items: {
            type: 'object',
            required: ['uri'],
            properties: {
              uri: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              mimeType: { type: 'string' },
            },
          },
        },
        customCapabilities: { type: 'object' },
      },
    },
    suites: {
      oneOf: [{ const: 'all' }, { type: 'array', items: { type: 'string' } }],
    },
    timeouts: {
      type: 'object',
      properties: {
        connectMs: { type: 'integer', minimum: 0 },
        invokeMs: { type: 'integer', minimum: 0 },
        shutdownMs: { type: 'integer', minimum: 0 },
        streamMs: { type: 'integer', minimum: 0 },
      },
    },
    chaos: {
      type: 'object',
      properties: {
        enable: { type: 'boolean' },
        seed: { type: 'integer' },
        network: {
          type: 'object',
          properties: {
            delayMs: {
              type: 'array',
              items: { type: 'integer', minimum: 0 },
              minItems: 2,
              maxItems: 2,
            },
            dropProbability: { type: 'number', minimum: 0, maximum: 1 },
            duplicateProbability: { type: 'number', minimum: 0, maximum: 1 },
            reorderProbability: { type: 'number', minimum: 0, maximum: 1 },
            corruptProbability: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
        stream: {
          type: 'object',
          properties: {
            chunkJitterMs: {
              type: 'array',
              items: { type: 'integer', minimum: 0 },
              minItems: 2,
              maxItems: 2,
            },
            reorderProbability: { type: 'number', minimum: 0, maximum: 1 },
            duplicateChunkProbability: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
        },
        protocol: {
          type: 'object',
          properties: {
            injectAbortProbability: { type: 'number', minimum: 0, maximum: 1 },
            malformedJsonProbability: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
            unexpectedMessageProbability: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
        },
        intensity: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    reporting: {
      type: 'object',
      properties: {
        formats: {
          type: 'array',
          items: { enum: ['html', 'json', 'junit', 'badge'] },
        },
        outputDir: { type: 'string' },
        includeFixtures: { type: 'boolean' },
        redaction: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            allowedFields: { type: 'array', items: { type: 'string' } },
            patterns: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    parallelism: {
      type: 'object',
      properties: {
        maxConcurrentTests: { type: 'integer', minimum: 1 },
        maxConcurrentConnections: { type: 'integer', minimum: 1 },
      },
    },
  },
};

/**
 * Load configuration from file
 */
export async function loadConfig(configPath?: string): Promise<CheckConfig> {
  const defaultPaths = [
    'mcp-check.config.json',
    'mcp-check.config.js',
    '.mcp-check.json',
    'package.json', // Look for mcp-check section
  ];

  const pathsToTry = configPath ? [configPath] : defaultPaths;

  for (const filePath of pathsToTry) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      let config: CheckConfig;

      if (filePath.endsWith('.json') || filePath === 'package.json') {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        if (filePath === 'package.json') {
          if (!parsed['mcp-check']) {
            continue;
          }
          config = parsed['mcp-check'];
        } else {
          config = parsed;
        }
      } else if (filePath.endsWith('.js')) {
        // Dynamic import for .js config files
        const configModule = await import(path.resolve(filePath));
        config = configModule.default || configModule;
      } else {
        continue;
      }

      return config;
    } catch (error) {
      if (configPath) {
        throw new Error(
          `Failed to load config from ${configPath}: ${error.message}`,
        );
      }
      // Continue trying other paths if this was auto-discovery
    }
  }

  if (configPath) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  throw new Error(
    `No configuration file found. Tried: ${pathsToTry.join(', ')}\n` +
      'Create a mcp-check.config.json file or specify --config <path>',
  );
}

/**
 * Validate configuration against schema
 */
export function validateConfig(config: Partial<CheckConfig>): ValidationResult {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(CONFIG_SCHEMA);

  const valid = validate(config);

  if (valid) {
    return { valid: true };
  }

  const errors =
    validate.errors?.map((error) => {
      const path = error.instancePath || 'root';
      return `${path}: ${error.message}`;
    }) || [];

  return {
    valid: false,
    errors,
  };
}

/**
 * Resolve configuration with defaults
 */
export function resolveConfig(config: CheckConfig): ResolvedCheckConfig {
  const resolved: ResolvedCheckConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    version: getPackageVersion(),
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      architecture: process.arch,
    },
    timeouts: {
      ...DEFAULT_CONFIG.timeouts!,
      ...config.timeouts,
    },
    chaos: {
      ...DEFAULT_CONFIG.chaos!,
      ...config.chaos,
    },
    reporting: {
      ...DEFAULT_CONFIG.reporting!,
      ...config.reporting,
      redaction: {
        ...DEFAULT_CONFIG.reporting!.redaction!,
        ...config.reporting?.redaction,
      },
    },
    parallelism: {
      ...DEFAULT_CONFIG.parallelism!,
      ...config.parallelism,
    },
  } as ResolvedCheckConfig;

  // Ensure suites is always an array
  // Only include actually implemented suites
  if (resolved.suites === 'all') {
    resolved.suites = [
      'handshake',
      'tool-discovery',
      'tool-invocation',
      'streaming',
    ];
  }

  return resolved;
}

/**
 * Create a default configuration file
 */
export async function createDefaultConfig(
  outputPath: string = 'mcp-check.config.json',
): Promise<void> {
  const defaultConfig: CheckConfig = {
    $schema: './schemas/mcp-check.config.schema.json',
    target: {
      type: 'stdio',
      command: 'node',
      args: ['dist/server.js'],
      env: { DEBUG: 'mcp:*' },
      cwd: '.',
    },
    expectations: {
      minProtocolVersion: '1.0.0',
      capabilities: ['tools'],
      tools: [
        {
          name: 'example-tool',
          required: true,
          description: 'An example tool for testing',
        },
      ],
    },
    suites: ['handshake', 'tool-discovery', 'tool-invocation'],
    timeouts: {
      connectMs: 5000,
      invokeMs: 15000,
      shutdownMs: 3000,
    },
    chaos: {
      enable: false,
    },
    reporting: {
      formats: ['html', 'json'],
      outputDir: './reports',
      includeFixtures: true,
    },
  };

  await fs.promises.writeFile(
    outputPath,
    JSON.stringify(defaultConfig, null, 2),
    'utf-8',
  );
}
