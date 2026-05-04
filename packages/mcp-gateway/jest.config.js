export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': '@swc/jest',
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@kloudi/infrastructure/database$':
      '<rootDir>/src/__tests__/__mocks__/infrastructure-database.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/__mocks__/'],
  passWithNoTests: true,
};
