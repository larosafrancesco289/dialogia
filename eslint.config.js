const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: ['node_modules', 'out', 'dist', 'dev-dist', 'tmp'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/lib/db/**/*.ts', 'src/lib/db/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/agent/**',
                '@/lib/store/**',
                '@/components/**',
                '../agent/**',
                '../../agent/**',
                '../../../agent/**',
                '../store/**',
                '../../store/**',
                '../../../store/**',
                '../components/**',
                '../../components/**',
                '../../../components/**',
              ],
              message: 'DB layer must not import agent, store, or component modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/agent/**/*.ts', 'src/lib/agent/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/components/**',
                '../components/**',
                '../../components/**',
                '../../../components/**',
              ],
              message: 'Agent layer must not import UI components.',
            },
            {
              group: [
                '@/lib/services',
                '@/lib/services/**',
                '../services/**',
                '../../services/**',
                '../../../services/**',
              ],
              message: 'Agent layer must not import services modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/**/*.ts', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/api', '@/lib/api/**', '@/lib/openrouter', '@/lib/openrouter/**'],
              message: 'UI components must not import transport clients.',
            },
            {
              group: ['@/lib/server/**', '@/lib/env/server', '**/*.server'],
              message: 'UI components must not import server-only modules.',
            },
            {
              group: ['@/lib/auth/**/*.server', '@/lib/auth/**/*.server.*'],
              message: 'UI components must not import server-only auth modules.',
            },
            {
              // Model output is untrusted and BYOK keys live in the same origin,
              // so the markdown pipeline must never render raw HTML.
              group: ['rehype-raw'],
              message:
                'Rendering raw HTML from model output would expose the stored provider keys to any injected script.',
            },
          ],
        },
      ],
    },
  },
  {
    // Feature modules are reached through `src/lib/modules.ts` and nowhere else, so
    // deleting one is a directory plus an entry in that file. Tests may import a
    // module directly to exercise it.
    files: [
      'src/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'functions/**/*.{ts,tsx}',
    ],
    ignores: ['src/lib/modules.ts', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*', '@/modules/**'],
              message:
                'Core must not import a feature module directly; go through @/lib/modules or a panel slot.',
            },
          ],
        },
      ],
      // `no-restricted-imports` sees neither dynamic imports nor relative
      // specifiers, so close both escape hatches here.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression > Literal[value=/(^|\\u002F)modules\\u002F/]',
          message:
            'Core must not dynamically import a feature module; go through @/lib/modules or a panel slot.',
        },
        {
          selector: 'ImportDeclaration[source.value=/^\\.\\.?\\u002F.*modules\\u002F/]',
          message:
            'Core must not import a feature module via a relative path; go through @/lib/modules or a panel slot.',
        },
      ],
    },
  },
  {
    // Core tool plumbing is module-agnostic: the registry, the scheduler, and the
    // planning pipeline reach feature modules only through `@/lib/modules`.
    files: [
      'src/lib/tools/registry.ts',
      'src/lib/tools/core/**/*.ts',
      'src/lib/tools/definitions/webSearch.ts',
      'src/lib/agent/tools/scheduler.ts',
      'src/lib/agent/planning/**/*.ts',
    ],
    ignores: ['src/lib/agent/planning/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/tutor',
                '@/lib/tutor/**',
                '@/lib/agent/tutor',
                '@/lib/agent/tutor/**',
                '@/lib/agent/tools/tutor',
                '@/lib/agent/tools/tutor/**',
                '@/lib/tools/definitions/tutor/**',
                './tutor',
                './tutor/**',
                '../tutor/**',
                '../../tutor/**',
              ],
              message:
                'Core tool plumbing must not import feature modules; go through @/lib/modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/lib/transport/**/*.ts',
      'src/lib/transport/**/*.tsx',
      'src/lib/openrouter/**/*.ts',
      'src/lib/openrouter/**/*.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/agent/**', '../agent/**', '../../agent/**', '../../../agent/**'],
              message: 'Transport and provider adapters must not import agent modules.',
            },
          ],
        },
      ],
    },
  },
];
