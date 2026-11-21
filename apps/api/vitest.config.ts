import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    // Testes de integração compartilham o banco de testes: um arquivo por vez evita interferência.
    fileParallelism: false,
    // Cada teste de integração limpa o banco e sobe a API: com a máquina carregada isso passa dos
    // 5 s padrão. Folga para não falhar por lentidão (falha de verdade continua falhando).
    testTimeout: 15_000,
    hookTimeout: 20_000,
  },
});
