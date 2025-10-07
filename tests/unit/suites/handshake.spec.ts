import { HandshakeTestSuite } from '../../../src/suites/handshake';
import { CheckConfig } from '../../../src/types/config';
import { TestContext } from '../../../src/types/test';

jest.mock('../../../src/core/mcp-client', () => {
  return {
    MCPTestClient: jest.fn().mockImplementation(() => ({
      connectFromTarget: jest.fn().mockResolvedValue(undefined),
      connectWithCustomTransport: jest.fn().mockResolvedValue(undefined),
      getServerCapabilities: jest.fn().mockReturnValue({ tools: true }),
      getServerVersion: jest.fn().mockReturnValue({ name: 'mock', version: '1.0.0' }),
      ping: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue([]),
      listResources: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('HandshakeTestSuite', () => {
  const suite = new HandshakeTestSuite();

  it('validates configuration', () => {
    const invalid = suite.validate({} as Partial<CheckConfig>);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain('Target configuration is required');

    const valid = suite.validate({ target: { type: 'stdio', command: 'node' } });
    expect(valid.valid).toBe(true);
  });

  it('executes happy path', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };

    const context = {
      config: {
        target: { type: 'stdio', command: 'node' },
      },
      logger,
      transport: {
        type: 'stdio',
        state: 'disconnected',
        stats: { messagesSent: 0, messagesReceived: 0, bytesTransferred: 0 },
      },
    } as unknown as TestContext;

    const result = await suite.execute(context);
    expect(result.status).toBe('passed');
    expect(result.cases.length).toBeGreaterThan(0);
  });
});
