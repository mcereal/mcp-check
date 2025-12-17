import * as fs from 'fs';
import * as path from 'path';
import { FileFixtureManager } from '../../../src/core/fixture-manager';
import { TestFixture } from '../../../src/types/test';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn(),
    readdir: jest.fn(),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('FileFixtureManager', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };

  const fixturesDir = './test-fixtures';
  let manager: FileFixtureManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new FileFixtureManager(fixturesDir, mockLogger as any);
  });

  describe('generate', () => {
    it('creates a fixture with default values', async () => {
      const fixture = await manager.generate({
        target: { type: 'stdio', command: 'node' },
      });

      expect(fixture.id).toMatch(/^fixture-/);
      expect(fixture.description).toBe('Generated test fixture');
      expect(fixture.timestamp).toBeDefined();
      expect(fixture.target).toEqual({ type: 'stdio', command: 'node' });
    });

    it('uses provided values when given', async () => {
      const fixture = await manager.generate({
        id: 'custom-fixture-id',
        description: 'Custom description',
        target: { type: 'stdio', command: 'python' },
        scenario: {
          toolName: 'test-tool',
          input: { key: 'value' },
          expectedBehavior: 'should succeed',
          actualBehavior: 'succeeded',
        },
      });

      expect(fixture.id).toBe('custom-fixture-id');
      expect(fixture.description).toBe('Custom description');
      expect(fixture.scenario.toolName).toBe('test-tool');
      expect(fixture.scenario.input).toEqual({ key: 'value' });
    });

    it('logs debug message after generation', async () => {
      await manager.generate({
        target: { type: 'stdio', command: 'node' },
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Generated test fixture',
        expect.objectContaining({ fixtureId: expect.any(String) }),
      );
    });
  });

  describe('save', () => {
    it('creates directory and saves fixture file', async () => {
      const fixture: TestFixture = {
        id: 'test-fixture',
        description: 'Test',
        timestamp: new Date().toISOString(),
        target: { type: 'stdio', command: 'node' },
        scenario: {
          expectedBehavior: 'pass',
          actualBehavior: 'pass',
        },
        reproduction: {
          command: 'test',
        },
      };

      await manager.save(fixture);

      expect(fs.promises.mkdir).toHaveBeenCalledWith(fixturesDir, { recursive: true });
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(fixturesDir, 'test-fixture.json'),
        JSON.stringify(fixture, null, 2),
        'utf-8',
      );
    });

    it('logs info message after successful save', async () => {
      const fixture: TestFixture = {
        id: 'test-fixture',
        description: 'Test',
        timestamp: new Date().toISOString(),
        target: { type: 'stdio', command: 'node' },
        scenario: { expectedBehavior: 'pass', actualBehavior: 'pass' },
        reproduction: { command: 'test' },
      };

      await manager.save(fixture);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Saved test fixture'),
      );
    });

    it('throws and logs error on write failure', async () => {
      const writeError = new Error('Write failed');
      (fs.promises.writeFile as jest.Mock).mockRejectedValueOnce(writeError);

      const fixture: TestFixture = {
        id: 'fail-fixture',
        description: 'Test',
        timestamp: new Date().toISOString(),
        target: { type: 'stdio', command: 'node' },
        scenario: { expectedBehavior: 'pass', actualBehavior: 'pass' },
        reproduction: { command: 'test' },
      };

      await expect(manager.save(fixture)).rejects.toThrow('Write failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('load', () => {
    it('loads fixture from file', async () => {
      const mockFixture = {
        id: 'loaded-fixture',
        description: 'Loaded',
        timestamp: '2024-01-01T00:00:00.000Z',
        target: { type: 'stdio', command: 'node' },
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(mockFixture),
      );

      const fixture = await manager.load('loaded-fixture');

      expect(fixture).toEqual(mockFixture);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join(fixturesDir, 'loaded-fixture.json'),
        'utf-8',
      );
    });

    it('handles .json extension in id', async () => {
      const mockFixture = { id: 'test', target: {} };
      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(mockFixture),
      );

      await manager.load('test.json');

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join(fixturesDir, 'test.json'),
        'utf-8',
      );
    });

    it('throws error on load failure', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValueOnce(
        new Error('File not found'),
      );

      await expect(manager.load('missing')).rejects.toThrow(
        'Failed to load fixture missing',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns empty array when directory does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      const fixtures = await manager.list();

      expect(fixtures).toEqual([]);
    });

    it('lists all fixture files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.promises.readdir as jest.Mock).mockResolvedValueOnce([
        'fixture1.json',
        'fixture2.json',
        'readme.txt', // Should be filtered out
      ]);

      const fixture1 = {
        id: 'fixture1',
        timestamp: '2024-01-02T00:00:00.000Z',
        target: {},
      };
      const fixture2 = {
        id: 'fixture2',
        timestamp: '2024-01-01T00:00:00.000Z',
        target: {},
      };

      (fs.promises.readFile as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify(fixture1))
        .mockResolvedValueOnce(JSON.stringify(fixture2));

      const fixtures = await manager.list();

      expect(fixtures).toHaveLength(2);
      // Should be sorted by timestamp
      expect(fixtures[0].id).toBe('fixture2');
      expect(fixtures[1].id).toBe('fixture1');
    });

    it('handles invalid fixture files gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.promises.readdir as jest.Mock).mockResolvedValueOnce([
        'valid.json',
        'invalid.json',
      ]);

      (fs.promises.readFile as jest.Mock)
        .mockResolvedValueOnce(
          JSON.stringify({ id: 'valid', timestamp: '2024-01-01', target: {} }),
        )
        .mockRejectedValueOnce(new Error('Invalid JSON'));

      const fixtures = await manager.list();

      expect(fixtures).toHaveLength(1);
      expect(fixtures[0].id).toBe('valid');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping invalid fixture file'),
        expect.any(Object),
      );
    });

    it('returns empty array on readdir error', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.promises.readdir as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied'),
      );

      const fixtures = await manager.list();

      expect(fixtures).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes fixtures older than maxAge', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.promises.readdir as jest.Mock).mockResolvedValueOnce([
        'old.json',
        'new.json',
      ]);

      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const newDate = new Date(); // Now

      const oldFixture = { id: 'old', timestamp: oldDate.toISOString(), target: {} };
      const newFixture = { id: 'new', timestamp: newDate.toISOString(), target: {} };

      (fs.promises.readFile as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify(oldFixture))
        .mockResolvedValueOnce(JSON.stringify(newFixture));

      const cleaned = await manager.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days

      expect(cleaned).toBe(1);
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        path.join(fixturesDir, 'old.json'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 1 old fixtures'),
      );
    });

    it('handles unlink errors gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.promises.readdir as jest.Mock).mockResolvedValueOnce(['old.json']);

      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const oldFixture = { id: 'old', timestamp: oldDate.toISOString(), target: {} };

      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(oldFixture),
      );
      (fs.promises.unlink as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied'),
      );

      const cleaned = await manager.cleanup();

      expect(cleaned).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clean up fixture'),
        expect.any(Object),
      );
    });

    it('returns 0 when no fixtures need cleanup', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.promises.readdir as jest.Mock).mockResolvedValueOnce(['new.json']);

      const newFixture = {
        id: 'new',
        timestamp: new Date().toISOString(),
        target: {},
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(newFixture),
      );

      const cleaned = await manager.cleanup();

      expect(cleaned).toBe(0);
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('exports all fixtures to output directory', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.promises.readdir as jest.Mock).mockResolvedValueOnce([
        'fixture1.json',
        'fixture2.json',
      ]);

      const fixture1 = { id: 'fixture1', timestamp: '2024-01-01', target: {} };
      const fixture2 = { id: 'fixture2', timestamp: '2024-01-02', target: {} };

      (fs.promises.readFile as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify(fixture1))
        .mockResolvedValueOnce(JSON.stringify(fixture2));

      const outputDir = './export-dir';
      await manager.export(outputDir);

      expect(fs.promises.mkdir).toHaveBeenCalledWith(outputDir, { recursive: true });
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Exported 2 fixtures'),
      );
    });

    it('handles empty fixtures list', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      await manager.export('./empty-export');

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Exported 0 fixtures'),
      );
    });
  });
});
