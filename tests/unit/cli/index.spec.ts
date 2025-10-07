import { runCLI } from '../../../src/cli/index';

jest.mock('chalk', () => ({
  blue: (text: string) => text,
  green: (text: string) => text,
  red: (text: string) => text,
  yellow: (text: string) => text,
}));

jest.mock('commander', () => {
  const registry: MockCommand[] = [];

  class MockCommand {
    static parseCalls: MockCommand[] = [];

    readonly subCommands: MockCommand[] = [];
    readonly options: Array<{ flags: string; description?: string }> = [];
    actionHandler?: (options?: any) => any;
    private _name?: string;
    private _description?: string;
    private _version?: string;

    constructor(private readonly identifier?: string) {
      registry.push(this);
    }

    name(label: string): this {
      this._name = label;
      return this;
    }

    description(text: string): this {
      this._description = text;
      return this;
    }

    version(text: string): this {
      this._version = text;
      return this;
    }

    command(name: string): MockCommand {
      const sub = new MockCommand(name);
      this.subCommands.push(sub);
      return sub;
    }

    option(flags: string, description?: string): this {
      this.options.push({ flags, description });
      return this;
    }

    action(handler: (options?: any) => any): this {
      this.actionHandler = handler;
      return this;
    }

    async parseAsync(): Promise<void> {
      MockCommand.parseCalls.push(this);
    }

    get meta() {
      return {
        commandName: this.identifier,
        name: this._name,
        description: this._description,
        version: this._version,
      };
    }
  }

  const Command = jest.fn(() => new MockCommand());

  return { Command, __registry: registry, __MockCommand: MockCommand };
});

describe('runCLI', () => {
  afterEach(() => {
    const commander = require('commander');
    commander.__registry.splice(0, commander.__registry.length);
    commander.__MockCommand.parseCalls.splice(0, commander.__MockCommand.parseCalls.length);
  });

  it('registers core commands and parses arguments', async () => {
    const commander = require('commander');

    await runCLI();

    expect(commander.Command).toHaveBeenCalledTimes(1);
    const rootCommand = commander.__registry[0];
    const commandNames = rootCommand.subCommands.map((cmd: any) => cmd.meta.commandName);

    expect(commandNames).toEqual(
      expect.arrayContaining(['test', 'init', 'validate', 'list-suites']),
    );
    expect(commander.__MockCommand.parseCalls).toContain(rootCommand);
  });

  it('lists suites without requiring subprocesses', async () => {
    const commander = require('commander');

    await runCLI();

    const rootCommand = commander.__registry[0];
    const listCommand = rootCommand.subCommands.find(
      (cmd: any) => cmd.meta.commandName === 'list-suites',
    );

    expect(listCommand).toBeDefined();
    listCommand?.actionHandler?.();

    expect(console.log).toHaveBeenCalled();
    const logged = (console.log as jest.Mock).mock.calls
      .map((args) => args.join(' '))
      .join(' ');
    expect(logged).toContain('suite');
  });
});
