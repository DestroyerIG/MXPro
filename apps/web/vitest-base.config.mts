import { defineConfig } from 'vitest/config';

/**
 * Ajustes do Vitest usados pelo `ng test` (angular.json: "runnerConfig": true).
 *
 * testTimeout: vários testes navegam pelas rotas reais do app, carregando telas sob demanda
 * (lazy) e fazendo login simulado. Em máquina lenta ou CI ocupado isso passa dos 5 s padrão
 * sem haver erro nenhum; 15 s evita falso alarme sem esconder um teste realmente travado.
 */
export default defineConfig({
  test: {
    testTimeout: 15_000,
  },
});
