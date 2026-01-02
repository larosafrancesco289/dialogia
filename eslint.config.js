const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');

module.exports = [
  {
    ignores: ['node_modules', '.next', 'out', 'dist', 'tmp'],
  },
  ...nextCoreWebVitals,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
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
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
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
              group: [
                '@/lib/headless/**',
                '@/lib/eval/**',
                '../lib/headless/**',
                '../../lib/headless/**',
                '../../../lib/headless/**',
                '../lib/eval/**',
                '../../lib/eval/**',
                '../../../lib/eval/**',
              ],
              message: 'UI components must not import headless or eval modules.',
            },
            {
              group: ['@/lib/server/**', '@/lib/env/server', '**/*.server'],
              message: 'UI components must not import server-only modules.',
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
