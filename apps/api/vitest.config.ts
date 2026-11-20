import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    // Testes de integração compartilham o banco de testes: um arquivo por vez evita interferência.
    fileParallelism: false,
  },
});
