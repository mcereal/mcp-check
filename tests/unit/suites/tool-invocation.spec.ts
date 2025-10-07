import { resolveConfig } from '../../../src/core/config';
import { ToolInvocationTestSuite } from '../../../src/suites/tool-invocation';
import type { CheckConfig } from '../../../src/types/config';
import type { TestContext } from '../../../src/types/test';
import type { Transport } from '../../../src/types/transport';

jest.mock('../../../src/core/mcp-client', () => ({
  MCPTestClient: jest.fn(),
}));

const { MCPTestClient } = jest.requireMock('../../../src/core/mcp-client') as {
  MCPTestClient: jest.Mock;
};

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
});

const createFixtures = () => ({
  generate: jest.fn(),
  save: jest.fn(),
  load: jest.fn(),
  list: jest.fn(),
});

const createTransport = (): Transport => ({
  type: 'stdio',
  state: 'connected',
  stats: { messagesSent: 0, messagesReceived: 0, bytesTransferred: 0 },
  connect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  waitForMessage: jest.fn(),
});

const createContext = (overrides?: Partial<CheckConfig>): TestContext => {
  const baseConfig: CheckConfig = {
    target: { type: 'stdio', command: 'node' },
    ...(overrides || {}),
  } as CheckConfig;

  const resolved = resolveConfig(baseConfig);

  return {
    config: resolved,
    transport: createTransport(),
    logger: createLogger(),
    fixtures: createFixtures(),
  } as unknown as TestContext;
};

const createMockClient = () => ({
  connectFromTarget: jest.fn().mockResolvedValue(undefined),
  connectWithCustomTransport: jest.fn().mockResolvedValue(undefined),
  listTools: jest.fn().mockResolvedValue([]),
  callTool: jest
    .fn()
    .mockResolvedValue({ result: { content: [{ type: 'text' }] }, isError: false }),
  close: jest.fn().mockResolvedValue(undefined),
});

describe('ToolInvocationTestSuite', () => {
  beforeEach(() => {
    MCPTestClient.mockReset();
  });

  it('warns when no tools are configured', () => {
    const suite = new ToolInvocationTestSuite();
    const result = suite.validate({ target: { type: 'stdio', command: 'node' } });

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      'No tools configured for testing - invocation tests will be limited',
    );
  });

  it('falls back to custom transport when SDK connection fails', async () => {
    const suite = new ToolInvocationTestSuite();
    const mockClient = createMockClient();

    mockClient.connectFromTarget.mockRejectedValue(new Error('sdk failure'));
    mockClient.listTools.mockResolvedValue([]);

    MCPTestClient.mockImplementation(() => mockClient);

    const context = createContext();
    const result = await suite.execute(context);

    expect(mockClient.connectFromTarget).toHaveBeenCalled();
    expect(mockClient.connectWithCustomTransport).toHaveBeenCalledWith(
      context.transport,
    );

    const availability = result.cases.find((c) => c.name === 'tool-availability');
    expect(availability?.status).toBe('skipped');
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('reports missing required tools and exercises invocation behaviour', async () => {
    const suite = new ToolInvocationTestSuite();

    const primaryClient = createMockClient();
    const timeoutClient = createMockClient();

    const availableTool = {
      name: 'echo',
      description: 'Echo tool',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
    } as any;

    primaryClient.listTools.mockResolvedValue([availableTool]);
    primaryClient.callTool.mockImplementation(async (name: string, input: any) => {
      if (name.startsWith('non-existent')) {
        throw new Error('tool not found');
      }
      if (typeof input?.message !== 'string') {
        throw new Error('validation error');
      }
      return {
        result: { content: [{ type: 'text', text: input.message || 'ok' }] },
        isError: false,
      };
    });

    timeoutClient.callTool.mockResolvedValue({
      result: { content: [{ type: 'text', text: 'timeout ok' }] },
      isError: false,
    });

    MCPTestClient.mockImplementationOnce(() => primaryClient).mockImplementationOnce(
      () => timeoutClient,
    );

    const context = createContext({
      expectations: {
        tools: [
          {
            name: 'required-tool',
            required: true,
          },
        ],
      },
    });

    const result = await suite.execute(context);

    const missingToolCase = result.cases.find(
      (c) => c.name === 'tool-required-tool-availability',
    );
    expect(missingToolCase?.status).toBe('failed');

    const basicInvocation = result.cases.find(
      (c) => c.name === 'tool-echo-basic-invocation',
    );
    expect(basicInvocation?.status).toBe('passed');

    const validationCase = result.cases.find(
      (c) => c.name === 'tool-echo-input-validation',
    );
    expect(validationCase?.status).toBe('passed');

    const timeoutCase = result.cases.find((c) => c.name === 'timeout-handling');
    expect(timeoutCase?.status === 'passed' || timeoutCase?.status === 'warning').toBe(true);

    const errorHandlingCase = result.cases.find(
      (c) => c.name === 'error-handling-nonexistent-tool',
    );
    expect(errorHandlingCase?.status).toBe('passed');

    expect(primaryClient.callTool).toHaveBeenCalledWith(
      expect.stringMatching(/non-existent-tool/),
      expect.any(Object),
    );
    expect(timeoutClient.callTool).toHaveBeenCalled();
  });
});
