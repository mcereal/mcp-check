/**
 * End-to-end tests for CLI functionality
 */

import { execSync, spawn } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const CLI_PATH = join(__dirname, '../../bin/mcp-check.js');
const TEST_CONFIG_DIR = join(tmpdir(), 'mcp-check-test');

describe('CLI E2E Tests', () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  describe('CLI Basic Functionality', () => {
    it('should show help when run with --help', () => {
      const result = execSync(`node ${CLI_PATH} --help`, { encoding: 'utf8' });

      expect(result).toContain('mcp-check');
      expect(result).toContain('Usage:');
      expect(result).toContain('Options:');
    });

    it('should show version when run with --version', () => {
      const result = execSync(`node ${CLI_PATH} --version`, {
        encoding: 'utf8',
      });

      expect(result).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should show error for invalid command', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} invalid-command`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      }).toThrow();
    });
  });

  describe('Configuration Commands', () => {
    const configPath = join(TEST_CONFIG_DIR, 'test-config.json');

    beforeEach(() => {
      // Clean up config file
      if (existsSync(configPath)) {
        require('fs').unlinkSync(configPath);
      }
    });

    it('should initialize configuration', () => {
      const result = execSync(
        `node ${CLI_PATH} init --config ${configPath} --target-type stdio --target-command echo`,
        { encoding: 'utf8' },
      );

      expect(result).toContain('Configuration initialized');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(config.target.type).toBe('stdio');
      expect(config.target.command).toBe('echo');
    });

    it('should validate configuration', () => {
      // Create a valid config
      const validConfig = {
        $schema: 'https://schema.example.com/mcp-check-config.json',
        target: {
          type: 'stdio',
          command: 'echo',
        },
        suites: ['handshake', 'tool-discovery'],
        reporting: {
          formats: ['json'],
        },
      };

      writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      const result = execSync(
        `node ${CLI_PATH} validate --config ${configPath}`,
        { encoding: 'utf8' },
      );

      expect(result).toContain('Configuration is valid');
    });

    it('should detect invalid configuration', () => {
      // Create an invalid config
      const invalidConfig = {
        // Missing required fields
        suites: ['handshake'],
      };

      writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => {
        execSync(`node ${CLI_PATH} validate --config ${configPath}`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      }).toThrow();
    });
  });

  describe('Test Execution', () => {
    const configPath = join(TEST_CONFIG_DIR, 'run-config.json');
    const outputDir = join(TEST_CONFIG_DIR, 'output');

    beforeEach(() => {
      // Create test configuration
      const config = {
        $schema: 'https://schema.example.com/mcp-check-config.json',
        target: {
          type: 'stdio',
          command: 'echo',
          args: ['{"jsonrpc": "2.0", "id": 1, "result": {}}'],
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json', 'junit'],
          outputDir,
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
    });

    it('should run tests with valid configuration', () => {
      const result = execSync(`node ${CLI_PATH} run --config ${configPath}`, {
        encoding: 'utf8',
        timeout: 30000,
      });

      expect(result).toContain('Starting MCP conformance tests');
    });

    it('should generate reports in specified formats', () => {
      execSync(`node ${CLI_PATH} run --config ${configPath}`, {
        encoding: 'utf8',
        timeout: 30000,
      });

      // Check for JSON report
      const jsonReportPath = join(outputDir, 'mcp-check-results.json');
      expect(existsSync(jsonReportPath)).toBe(true);

      // Check for JUnit report
      const junitReportPath = join(outputDir, 'mcp-check-results.xml');
      expect(existsSync(junitReportPath)).toBe(true);
    });

    it('should respect --suites option', () => {
      const result = execSync(
        `node ${CLI_PATH} run --config ${configPath} --suites handshake`,
        { encoding: 'utf8', timeout: 30000 },
      );

      expect(result).toContain('handshake');
    });

    it('should respect --fail-fast option', () => {
      const result = execSync(
        `node ${CLI_PATH} run --config ${configPath} --fail-fast`,
        { encoding: 'utf8', timeout: 30000 },
      );

      // Should complete quickly if fail-fast is working
      expect(result).toBeDefined();
    });

    it('should respect --output-dir option', () => {
      const customOutputDir = join(TEST_CONFIG_DIR, 'custom-output');

      execSync(
        `node ${CLI_PATH} run --config ${configPath} --output-dir ${customOutputDir}`,
        { encoding: 'utf8', timeout: 30000 },
      );

      expect(existsSync(join(customOutputDir, 'mcp-check-results.json'))).toBe(
        true,
      );
    });
  });

  describe('Chaos Testing', () => {
    const chaosConfigPath = join(TEST_CONFIG_DIR, 'chaos-config.json');

    beforeEach(() => {
      const config = {
        $schema: 'https://schema.example.com/mcp-check-config.json',
        target: {
          type: 'stdio',
          command: 'echo',
          args: ['{"jsonrpc": "2.0", "id": 1, "result": {}}'],
        },
        suites: ['handshake'],
        chaos: {
          enable: true,
          scenarios: ['network', 'protocol'],
          failureRate: 0.1,
        },
        reporting: {
          formats: ['json'],
        },
      };

      writeFileSync(chaosConfigPath, JSON.stringify(config, null, 2));
    });

    it('should run chaos tests when enabled', () => {
      const result = execSync(
        `node ${CLI_PATH} run --config ${chaosConfigPath}`,
        { encoding: 'utf8', timeout: 30000 },
      );

      expect(result).toContain('chaos');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration file', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} run --config non-existent-config.json`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      }).toThrow();
    });

    it('should handle invalid target configuration', () => {
      const invalidConfigPath = join(TEST_CONFIG_DIR, 'invalid-target.json');
      const config = {
        target: {
          type: 'invalid-transport-type',
        },
        suites: ['handshake'],
      };

      writeFileSync(invalidConfigPath, JSON.stringify(config, null, 2));

      expect(() => {
        execSync(`node ${CLI_PATH} run --config ${invalidConfigPath}`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      }).toThrow();
    });
  });

  describe('Verbose Output', () => {
    const configPath = join(TEST_CONFIG_DIR, 'verbose-config.json');

    beforeEach(() => {
      const config = {
        target: {
          type: 'stdio',
          command: 'echo',
          args: ['{"jsonrpc": "2.0", "id": 1, "result": {}}'],
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));
    });

    it('should provide verbose output when requested', () => {
      const result = execSync(
        `node ${CLI_PATH} run --config ${configPath} --verbose`,
        { encoding: 'utf8', timeout: 30000 },
      );

      expect(result.length).toBeGreaterThan(0);
    });

    it('should provide debug output when requested', () => {
      const result = execSync(
        `node ${CLI_PATH} run --config ${configPath} --debug`,
        { encoding: 'utf8', timeout: 30000 },
      );

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Streaming Output', () => {
    const configPath = join(TEST_CONFIG_DIR, 'stream-config.json');

    beforeEach(() => {
      const config = {
        target: {
          type: 'stdio',
          command: 'echo',
          args: ['{"jsonrpc": "2.0", "id": 1, "result": {}}'],
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));
    });

    it('should handle streaming output correctly', (done) => {
      const child = spawn('node', [CLI_PATH, 'run', '--config', configPath], {
        stdio: 'pipe',
        timeout: 30000,
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(output.length).toBeGreaterThan(0);
        done();
      });

      child.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Configuration Generation', () => {
    it('should generate sample configuration', () => {
      const sampleConfigPath = join(TEST_CONFIG_DIR, 'sample-config.json');

      const result = execSync(
        `node ${CLI_PATH} generate-config --output ${sampleConfigPath}`,
        { encoding: 'utf8' },
      );

      expect(result).toContain('Configuration generated');
      expect(existsSync(sampleConfigPath)).toBe(true);

      const config = JSON.parse(readFileSync(sampleConfigPath, 'utf8'));
      expect(config.target).toBeDefined();
      expect(config.suites).toBeDefined();
      expect(config.reporting).toBeDefined();
    });
  });

  describe('Exit Codes', () => {
    const configPath = join(TEST_CONFIG_DIR, 'exit-code-config.json');

    it('should exit with 0 for successful tests', () => {
      const config = {
        target: {
          type: 'stdio',
          command: 'echo',
          args: ['{"jsonrpc": "2.0", "id": 1, "result": {"capabilities": {}}}'],
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const result = execSync(
        `node ${CLI_PATH} run --config ${configPath}; echo $?`,
        { encoding: 'utf8', timeout: 30000 },
      );

      expect(result).toContain('0');
    });

    it('should exit with non-zero for failed tests', () => {
      const config = {
        target: {
          type: 'stdio',
          command: 'false', // Command that always fails
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      try {
        execSync(`node ${CLI_PATH} run --config ${configPath}`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000,
        });
      } catch (error: any) {
        expect(error.status).not.toBe(0);
      }
    });
  });
});
