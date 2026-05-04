/**
 * Test mock for @kloudi/infrastructure/database.
 *
 * Returns a fake Prisma client that simulates active integrations for all
 * known integration types used in mcp-gateway tests.
 */
export const Database = {
  getInstance: () => ({
    getClient: async () => ({
      integration: {
        findMany: async () => [
          { type: 'builtin' },
          { type: 'github' },
          { type: 'jira' },
        ],
        findFirst: async () => null,
      },
    }),
  }),
};
