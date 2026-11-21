// @ts-check
/**
 * ESLint do monorepo inteiro (um arquivo só, no formato "flat config").
 *
 * - TypeScript em todos os pacotes: regras recomendadas + algumas que usam os TIPOS do código
 *   (ex.: promessa esquecida sem `await`, que em cronometragem pode virar lançamento perdido).
 * - Front (apps/web): regras do angular-eslint para componentes e templates, incluindo acessibilidade.
 *
 * Rodar: `pnpm lint` (raiz). O CI roda o mesmo comando.
 */
import js from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.angular/',
    '**/coverage/',
    'packages/db/src/generated/', // cliente gerado pelo Prisma
  ]),

  {
    files: ['**/*.ts', '**/*.mjs'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        // projectService: o ESLint descobre sozinho o tsconfig de cada arquivo (cada pacote tem o seu).
        projectService: {
          allowDefaultProject: ['*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Promessas: nada de "dispara e esquece" sem deixar explícito com `void`.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // `_` no início = parâmetro/variável ignorado de propósito.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Front Angular: componentes, diretivas e templates inline.
  {
    files: ['apps/web/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      // Componentes de tela usam o prefixo "app-"; os do design system, "ui-".
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: ['app', 'ui'], style: 'kebab-case' }],
      // Diretivas e componentes de ATRIBUTO (<button uiButton>) usam camelCase com prefixo "ui".
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: ['app', 'ui'], style: 'camelCase' }],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-signals': 'error',
    },
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },

  // Testes: mais liberdade (dados fictícios, asserções com `!`).
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts', '**/*.testing.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Scripts de linha de comando (seed, servidor): podem escrever no console.
  {
    files: ['packages/db/prisma/**/*.ts', 'apps/api/src/server.ts'],
    rules: { 'no-console': 'off' },
  },
]);
