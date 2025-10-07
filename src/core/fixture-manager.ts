/**
 * Test fixture management for reproducible testing scenarios
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { TestFixture, TestFixtureManager } from '../types/test';
import { Logger } from '../types/reporting';

/**
 * File-based fixture manager implementation
 */
export class FileFixtureManager implements TestFixtureManager {
  constructor(
    private fixturesDir: string = './fixtures',
    private logger: Logger,
  ) {}

  async generate(scenario: Partial<TestFixture>): Promise<TestFixture> {
    const fixture: TestFixture = {
      id: scenario.id || `fixture-${randomUUID()}`,
      description: scenario.description || 'Generated test fixture',
      timestamp: new Date().toISOString(),
      chaosConfig: scenario.chaosConfig,
      target: scenario.target!,
      scenario: {
        toolName: scenario.scenario?.toolName,
        input: scenario.scenario?.input,
        expectedBehavior:
          scenario.scenario?.expectedBehavior || 'Unknown expected behavior',
        actualBehavior:
          scenario.scenario?.actualBehavior || 'Unknown actual behavior',
      },
      reproduction: {
        command: `npx mcp-check --fixture ${path.join(this.fixturesDir, scenario.id || 'fixture.json')}`,
        environment: scenario.reproduction?.environment,
      },
    };

    this.logger.debug('Generated test fixture', { fixtureId: fixture.id });
    return fixture;
  }

  async save(fixture: TestFixture): Promise<void> {
    // Ensure fixtures directory exists
    await fs.promises.mkdir(this.fixturesDir, { recursive: true });

    const filename = `${fixture.id}.json`;
    const filepath = path.join(this.fixturesDir, filename);

    try {
      await fs.promises.writeFile(
        filepath,
        JSON.stringify(fixture, null, 2),
        'utf-8',
      );

      this.logger.info(`Saved test fixture: ${filepath}`);
    } catch (error) {
      this.logger.error(`Failed to save fixture ${fixture.id}`, {
        error: error.message,
      });
      throw error;
    }
  }

  async load(id: string): Promise<TestFixture> {
    const filename = id.endsWith('.json') ? id : `${id}.json`;
    const filepath = path.join(this.fixturesDir, filename);

    try {
      const content = await fs.promises.readFile(filepath, 'utf-8');
      const fixture = JSON.parse(content);

      this.logger.debug('Loaded test fixture', { fixtureId: fixture.id });
      return fixture;
    } catch (error) {
      const message = `Failed to load fixture ${id}: ${error.message}`;
      this.logger.error(message);
      throw new Error(message);
    }
  }

  async list(): Promise<TestFixture[]> {
    try {
      // Check if fixtures directory exists
      if (!fs.existsSync(this.fixturesDir)) {
        return [];
      }

      const files = await fs.promises.readdir(this.fixturesDir);
      const fixtureFiles = files.filter((file) => file.endsWith('.json'));

      const fixtures: TestFixture[] = [];
      for (const file of fixtureFiles) {
        try {
          const fixture = await this.load(file);
          fixtures.push(fixture);
        } catch (error) {
          this.logger.warn(`Skipping invalid fixture file: ${file}`, {
            error: error.message,
          });
        }
      }

      return fixtures.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    } catch (error) {
      this.logger.error('Failed to list fixtures', { error: error.message });
      return [];
    }
  }

  /**
   * Clean up old fixtures
   */
  async cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const fixtures = await this.list();
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;

    for (const fixture of fixtures) {
      const fixtureDate = new Date(fixture.timestamp);
      if (fixtureDate < cutoff) {
        try {
          const filepath = path.join(this.fixturesDir, `${fixture.id}.json`);
          await fs.promises.unlink(filepath);
          cleaned++;
          this.logger.debug(`Cleaned up old fixture: ${fixture.id}`);
        } catch (error) {
          this.logger.warn(`Failed to clean up fixture ${fixture.id}`, {
            error: error.message,
          });
        }
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} old fixtures`);
    }

    return cleaned;
  }

  /**
   * Export fixtures to a specific directory
   */
  async export(outputDir: string): Promise<void> {
    const fixtures = await this.list();

    await fs.promises.mkdir(outputDir, { recursive: true });

    for (const fixture of fixtures) {
      const filename = `${fixture.id}.json`;
      const outputPath = path.join(outputDir, filename);

      await fs.promises.writeFile(
        outputPath,
        JSON.stringify(fixture, null, 2),
        'utf-8',
      );
    }

    this.logger.info(`Exported ${fixtures.length} fixtures to ${outputDir}`);
  }
}
