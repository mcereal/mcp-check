/**
 * Unit tests for TestFixtureManager
 */

import * as fs from 'fs';
import * as path from 'path';
import { FileFixtureManager } from '../../../src/core/fixture-manager';
import { TestFixture } from '../../../src/types/test';
import { Logger } from '../../../src/types/reporting';
import { createTempDir, cleanupTempDir } from '../../helpers/test-utils';

describe('FileFixtureManager', () => {
  let fixtureManager: FileFixtureManager;
  let tempDir: string;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    tempDir = createTempDir();
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue(mockLogger),
    };

    fixtureManager = new FileFixtureManager(tempDir, mockLogger);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create directory if it does not exist', () => {
      const newDir = path.join(tempDir, 'new-fixtures');
      expect(fs.existsSync(newDir)).toBe(false);

      new FileFixtureManager(newDir, mockLogger);

      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should not fail if directory already exists', () => {
      const existingDir = path.join(tempDir, 'existing');
      fs.mkdirSync(existingDir);

      expect(() => {
        new FileFixtureManager(existingDir, mockLogger);
      }).not.toThrow();
    });
  });

  describe('Saving Fixtures', () => {
    it('should save a simple fixture', async () => {
      const fixture: TestFixture = {
        id: 'test-fixture-1',
        description: 'A test fixture',
        timestamp: new Date().toISOString(),
        scenario: {
          suite: 'handshake',
          testCase: 'connection-test',
          target: {
            type: 'stdio',
            command: 'echo',
            args: ['test'],
          },
        },
        reproducible: true,
      };

      await fixtureManager.save(fixture);

      const savedPath = path.join(tempDir, 'test-fixture-1.json');
      expect(fs.existsSync(savedPath)).toBe(true);

      const savedContent = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(savedContent).toEqual(fixture);
    });

    it('should handle fixtures with special characters in ID', async () => {
      const fixture: TestFixture = {
        id: 'test-fixture:special@chars#123',
        description: 'A fixture with special chars',
        timestamp: new Date().toISOString(),
        scenario: {
          suite: 'test',
          testCase: 'test',
          target: { type: 'stdio', command: 'test', args: [] },
        },
        reproducible: true,
      };

      await fixtureManager.save(fixture);

      // Should sanitize filename
      const expectedPath = path.join(
        tempDir,
        'test-fixture_special_chars_123.json',
      );
      expect(fs.existsSync(expectedPath)).toBe(true);
    });

    it('should overwrite existing fixtures with same ID', async () => {
      const fixture1: TestFixture = {
        id: 'duplicate-id',
        description: 'First fixture',
        timestamp: '2023-01-01T00:00:00.000Z',
        scenario: {
          suite: 'test',
          testCase: 'test',
          target: { type: 'stdio', command: 'test1', args: [] },
        },
        reproducible: true,
      };

      const fixture2: TestFixture = {
        id: 'duplicate-id',
        description: 'Second fixture',
        timestamp: '2023-01-02T00:00:00.000Z',
        scenario: {
          suite: 'test',
          testCase: 'test',
          target: { type: 'stdio', command: 'test2', args: [] },
        },
        reproducible: true,
      };

      await fixtureManager.save(fixture1);
      await fixtureManager.save(fixture2);

      const savedPath = path.join(tempDir, 'duplicate-id.json');
      const savedContent = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(savedContent).toEqual(fixture2);
    });

    it('should handle write errors gracefully', async () => {
      const fixture: TestFixture = {
        id: 'test-fixture',
        description: 'A test fixture',
        timestamp: new Date().toISOString(),
        scenario: {
          suite: 'test',
          testCase: 'test',
          target: { type: 'stdio', command: 'test', args: [] },
        },
        reproducible: true,
      };

      // Make directory read-only to simulate write error
      fs.chmodSync(tempDir, 0o444);

      await expect(fixtureManager.save(fixture)).rejects.toThrow();

      // Restore permissions for cleanup
      fs.chmodSync(tempDir, 0o755);
    });
  });

  describe('Loading Fixtures', () => {
    beforeEach(async () => {
      // Create some test fixtures
      const fixtures: TestFixture[] = [
        {
          id: 'fixture-1',
          description: 'First fixture',
          timestamp: '2023-01-01T00:00:00.000Z',
          scenario: {
            suite: 'handshake',
            testCase: 'connection',
            target: { type: 'stdio', command: 'test1', args: [] },
          },
          reproducible: true,
        },
        {
          id: 'fixture-2',
          description: 'Second fixture',
          timestamp: '2023-01-02T00:00:00.000Z',
          scenario: {
            suite: 'tool-discovery',
            testCase: 'list-tools',
            target: { type: 'tcp', host: 'localhost', port: 8080 },
          },
          reproducible: false,
        },
      ];

      for (const fixture of fixtures) {
        await fixtureManager.save(fixture);
      }
    });

    it('should load a specific fixture by ID', async () => {
      const loaded = await fixtureManager.load('fixture-1');

      expect(loaded).toBeDefined();
      expect(loaded!.id).toBe('fixture-1');
      expect(loaded!.description).toBe('First fixture');
      expect(loaded!.scenario.suite).toBe('handshake');
    });

    it('should return undefined for non-existent fixture', async () => {
      const loaded = await fixtureManager.load('non-existent');

      expect(loaded).toBeUndefined();
    });

    it('should handle malformed JSON files gracefully', async () => {
      const malformedPath = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformedPath, '{ invalid json }');

      const loaded = await fixtureManager.load('malformed');

      expect(loaded).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load fixture malformed',
        expect.any(Object),
      );
    });

    it('should handle read errors gracefully', async () => {
      const restrictedPath = path.join(tempDir, 'restricted.json');
      fs.writeFileSync(restrictedPath, '{}');
      fs.chmodSync(restrictedPath, 0o000); // No read permissions

      const loaded = await fixtureManager.load('restricted');

      expect(loaded).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();

      // Restore permissions for cleanup
      fs.chmodSync(restrictedPath, 0o644);
    });
  });

  describe('Listing Fixtures', () => {
    beforeEach(async () => {
      // Create test fixtures
      const fixtures: TestFixture[] = [
        {
          id: 'handshake-1',
          description: 'Handshake test 1',
          timestamp: '2023-01-01T00:00:00.000Z',
          scenario: {
            suite: 'handshake',
            testCase: 'connection',
            target: { type: 'stdio', command: 'test', args: [] },
          },
          reproducible: true,
        },
        {
          id: 'handshake-2',
          description: 'Handshake test 2',
          timestamp: '2023-01-02T00:00:00.000Z',
          scenario: {
            suite: 'handshake',
            testCase: 'version-check',
            target: { type: 'stdio', command: 'test', args: [] },
          },
          reproducible: true,
        },
        {
          id: 'tool-test-1',
          description: 'Tool test',
          timestamp: '2023-01-03T00:00:00.000Z',
          scenario: {
            suite: 'tool-discovery',
            testCase: 'list',
            target: { type: 'stdio', command: 'test', args: [] },
          },
          reproducible: false,
        },
      ];

      for (const fixture of fixtures) {
        await fixtureManager.save(fixture);
      }

      // Create a non-JSON file to test filtering
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'Not a fixture');
    });

    it('should list all fixtures', async () => {
      const fixtures = await fixtureManager.list();

      expect(fixtures).toHaveLength(3);
      expect(fixtures.map((f) => f.id).sort()).toEqual([
        'handshake-1',
        'handshake-2',
        'tool-test-1',
      ]);
    });

    it('should filter fixtures by suite', async () => {
      const handshakeFixtures = await fixtureManager.list({
        suite: 'handshake',
      });

      expect(handshakeFixtures).toHaveLength(2);
      expect(
        handshakeFixtures.every((f) => f.scenario.suite === 'handshake'),
      ).toBe(true);
    });

    it('should filter fixtures by reproducible status', async () => {
      const reproducibleFixtures = await fixtureManager.list({
        reproducible: true,
      });

      expect(reproducibleFixtures).toHaveLength(2);
      expect(reproducibleFixtures.every((f) => f.reproducible === true)).toBe(
        true,
      );
    });

    it('should filter fixtures by multiple criteria', async () => {
      const filtered = await fixtureManager.list({
        suite: 'handshake',
        reproducible: true,
      });

      expect(filtered).toHaveLength(2);
      expect(
        filtered.every(
          (f) => f.scenario.suite === 'handshake' && f.reproducible === true,
        ),
      ).toBe(true);
    });

    it('should return empty array when no fixtures match filter', async () => {
      const filtered = await fixtureManager.list({ suite: 'non-existent' });

      expect(filtered).toHaveLength(0);
    });

    it('should handle directory read errors gracefully', async () => {
      // Make directory unreadable
      fs.chmodSync(tempDir, 0o000);

      const fixtures = await fixtureManager.list();

      expect(fixtures).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list fixtures'),
        expect.any(Object),
      );

      // Restore permissions for cleanup
      fs.chmodSync(tempDir, 0o755);
    });

    it('should ignore malformed fixture files when listing', async () => {
      // Add a malformed fixture file
      fs.writeFileSync(path.join(tempDir, 'malformed.json'), '{ invalid }');

      const fixtures = await fixtureManager.list();

      // Should still return the 3 valid fixtures, ignoring the malformed one
      expect(fixtures).toHaveLength(3);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse fixture'),
        expect.any(Object),
      );
    });
  });

  describe('Deleting Fixtures', () => {
    beforeEach(async () => {
      const fixture: TestFixture = {
        id: 'to-delete',
        description: 'Fixture to delete',
        timestamp: new Date().toISOString(),
        scenario: {
          suite: 'test',
          testCase: 'test',
          target: { type: 'stdio', command: 'test', args: [] },
        },
        reproducible: true,
      };

      await fixtureManager.save(fixture);
    });

    it('should delete existing fixture', async () => {
      const fixturePath = path.join(tempDir, 'to-delete.json');
      expect(fs.existsSync(fixturePath)).toBe(true);

      await fixtureManager.delete('to-delete');

      expect(fs.existsSync(fixturePath)).toBe(false);
    });

    it('should handle deletion of non-existent fixture', async () => {
      await expect(
        fixtureManager.delete('non-existent'),
      ).resolves.not.toThrow();
    });

    it('should handle deletion errors gracefully', async () => {
      const fixturePath = path.join(tempDir, 'to-delete.json');

      // Make file undeletable
      fs.chmodSync(fixturePath, 0o444);
      fs.chmodSync(tempDir, 0o444);

      await expect(fixtureManager.delete('to-delete')).rejects.toThrow();

      // Restore permissions for cleanup
      fs.chmodSync(tempDir, 0o755);
      fs.chmodSync(fixturePath, 0o644);
    });
  });

  describe('Clearing All Fixtures', () => {
    beforeEach(async () => {
      // Create multiple fixtures
      const fixtures: TestFixture[] = [
        {
          id: 'fixture-1',
          description: 'First',
          timestamp: new Date().toISOString(),
          scenario: {
            suite: 'test',
            testCase: 'test',
            target: { type: 'stdio', command: 'test', args: [] },
          },
          reproducible: true,
        },
        {
          id: 'fixture-2',
          description: 'Second',
          timestamp: new Date().toISOString(),
          scenario: {
            suite: 'test',
            testCase: 'test',
            target: { type: 'stdio', command: 'test', args: [] },
          },
          reproducible: true,
        },
      ];

      for (const fixture of fixtures) {
        await fixtureManager.save(fixture);
      }

      // Add non-fixture file
      fs.writeFileSync(
        path.join(tempDir, 'readme.txt'),
        'Should not be deleted',
      );
    });

    it('should clear all fixture files', async () => {
      expect(fs.readdirSync(tempDir)).toHaveLength(3); // 2 fixtures + readme

      await fixtureManager.clear();

      const remaining = fs.readdirSync(tempDir);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toBe('readme.txt');
    });

    it('should handle clear errors gracefully', async () => {
      // Make directory read-only to prevent deletion
      fs.chmodSync(tempDir, 0o444);

      await expect(fixtureManager.clear()).rejects.toThrow();

      // Restore permissions for cleanup
      fs.chmodSync(tempDir, 0o755);
    });
  });

  describe('Filename Sanitization', () => {
    it('should sanitize fixture IDs for safe filenames', async () => {
      const fixture: TestFixture = {
        id: 'test/fixture:with@special#chars%and spaces',
        description: 'Test fixture',
        timestamp: new Date().toISOString(),
        scenario: {
          suite: 'test',
          testCase: 'test',
          target: { type: 'stdio', command: 'test', args: [] },
        },
        reproducible: true,
      };

      await fixtureManager.save(fixture);

      const expectedFilename =
        'test_fixture_with_special_chars_and_spaces.json';
      const expectedPath = path.join(tempDir, expectedFilename);
      expect(fs.existsSync(expectedPath)).toBe(true);

      // Should be able to load it back
      const loaded = await fixtureManager.load(fixture.id);
      expect(loaded).toEqual(fixture);
    });
  });
});
