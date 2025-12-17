import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveConfig, validateConfig, loadConfig } from '../../../src/core/config';
import { CheckConfig } from '../../../src/types/config';

describe('core/config', () => {
  const minimalConfig: CheckConfig = {
    target: {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    },
  };

  describe('validateConfig', () => {
    it('accepts minimal configuration', () => {
      const result = validateConfig(minimalConfig);
      expect(result.valid).toBe(true);
    });

    it('rejects missing target', () => {
      const result = validateConfig({} as CheckConfig);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((message) => message.includes('target'))).toBe(true);
    });
  });

  describe('resolveConfig', () => {
    it('injects defaults while preserving overrides', () => {
      const resolved = resolveConfig({
        ...minimalConfig,
        reporting: { formats: ['json'] },
        suites: ['handshake'],
        chaos: { enable: true, intensity: 0.2 },
      });

      expect(resolved.reporting?.formats).toEqual(['json']);
      expect(resolved.reporting?.includeFixtures).toBe(true);
      expect(resolved.chaos?.enable).toBe(true);
      expect(resolved.chaos?.intensity).toBe(0.2);
      expect(resolved.timeouts?.connectMs).toBeGreaterThan(0);
      // Version should be read from package.json
      expect(resolved.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('expands suites="all" into the canonical list', () => {
      const resolved = resolveConfig({ ...minimalConfig, suites: 'all' });
      expect(Array.isArray(resolved.suites)).toBe(true);
      // All implemented suites should be included
      expect(resolved.suites).toContain('handshake');
      expect(resolved.suites).toContain('tool-discovery');
      expect(resolved.suites).toContain('tool-invocation');
      expect(resolved.suites).toContain('streaming');
      expect(resolved.suites).toContain('timeout');
      expect(resolved.suites).toContain('large-payload');
      expect(resolved.suites).toHaveLength(6);
    });
  });

  describe('loadConfig', () => {
    it('reads configuration from disk', async () => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcp-check-'));
      const filePath = path.join(tmpDir, 'config.json');
      await fs.promises.writeFile(filePath, JSON.stringify(minimalConfig, null, 2));

      const config = await loadConfig(filePath);
      expect(config.target?.type).toBe('stdio');
    });
  });
});
