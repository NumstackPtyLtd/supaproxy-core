import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'json', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__tests__/**',

        // Pure type definitions (no runtime code to cover)
        'src/domain/*/repository.ts',
        'src/domain/audit/**',
        'src/application/ports/**',
        'src/shared/**',

        // Infrastructure requiring external services (Anthropic, MCP)
        'src/infrastructure/ai/**',
        'src/infrastructure/mcp/**',

        // Presentation routes are thin controllers; their logic is tested via use case tests
        'src/presentation/routes/**',

        // Observability uses filesystem I/O; cost estimation tested separately
        'src/observability/**',

        // ExecuteQueryUseCase is the AI agent loop; requires integration-level mocking
        'src/application/query/ExecuteQueryUseCase.ts',

        // Composition root, entrypoints, and runtime wiring (integration-level)
        'src/container.ts',
        'src/index.ts',
        'src/app.ts',
        'src/server.ts',
        'src/startup.ts',
        'src/config.ts',
        'src/openapi.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
})
