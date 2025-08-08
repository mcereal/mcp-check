const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        useESM: false,
      },
    ],
  },
  coveragePathIgnorePatterns: [
    'node_modules/',
    'tests/',
    'coverage/',
    'bin/',
    'docs/',
    'examples/',
    '\\.spec\\.',
    '\\.test\\.',
    'jest.config.ts',
    'eslint.config.mjs',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
  ],
  moduleDirectories: ['node_modules', 'src'],
  testTimeout: 10000, // 10 second timeout for all tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};

module.exports = config;
