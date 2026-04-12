export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': '@swc/jest',
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'apps/*/src/**/*.{js,ts}',
    'packages/*/**/*.{js,ts}',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/dist/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
