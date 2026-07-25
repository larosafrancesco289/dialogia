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
                '@/tooling/headless/**',
                '@/tooling/eval/**',
                '../tooling/headless/**',
                '../../tooling/headless/**',
                '../../../tooling/headless/**',
                '../tooling/eval/**',
                '../../tooling/eval/**',
                '../../../tooling/eval/**',
              ],
              message: 'UI components must not import headless or eval modules.',
            },
            {
              group: ['@/lib/server/**', '@/lib/env/server', '**/*.server'],
              message: 'UI components must not import server-only modules.',
            },
            {
              group: ['@/lib/auth/**/*.server', '@/lib/auth/**/*.server.*'],
              message: 'UI components must not import server-only auth modules.',
            },
          ],
        },
      ],
    },
  },
  {
    // Feature modules are reached through `src/lib/modules.ts` and nowhere else, so
    // deleting one is a directory plus an entry in that file.
    //
    // The `ignores` list is the remaining Stage 1 debt: every entry is a core file
    // that still imports the tutor module directly and needs a module hook or a UI
    // slot before it can be removed from this list. New violations fail the build.
    files: ['src/lib/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/modules.ts',
      // UI mounts awaiting typed panel slots
      'src/components/HomeClient.tsx',
      'src/components/message/AssistantMessage.tsx',
      'src/components/message/MessagePanels.tsx',
      'src/components/settings/hooks/useSettingsDrawerState.tsx',
      'src/components/top-header/TopHeaderView.tsx',
      'src/components/top-header/useTopHeaderState.ts',
      // Turn/persistence paths awaiting module hooks
      'src/lib/agent/orchestrator/lifecycle.ts',
      'src/lib/agent/tools/router.ts',
      'src/lib/services/bootstrap.ts',
      'src/lib/services/messagePersistence.ts',
      'src/lib/services/turns.ts',
      'src/lib/settings/normalize.ts',
      'src/lib/store/chatSlice.ts',
      'src/lib/store/normalize.ts',
      'src/lib/store/stateTypes.ts',
      'src/lib/turns/runtime/context.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
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
