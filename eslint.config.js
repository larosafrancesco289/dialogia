const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');

// Flat config gives each file one `no-restricted-imports` option set: a later
// block replaces an earlier one's rather than adding to it. So every layer's
// patterns and the feature-module ban are combined here, one block per file set,
// and no two blocks below may match the same file.
const TESTS = ['**/*.test.ts', '**/*.test.tsx'];
const CORE = ['src/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'];

// Feature modules are reached through `src/lib/modules.ts` and nowhere else, so
// deleting one is a directory plus an entry in that file. Tests may import a
// module directly to exercise it.
const MODULES_BAN = {
  group: ['@/modules/*', '@/modules/**'],
  message:
    'Core must not import a feature module directly; go through @/lib/modules or a panel slot.',
};

const restrict = (patterns) =>
  patterns.length ? { 'no-restricted-imports': ['error', { patterns }] } : {};

function layer(files, patterns, ignores = []) {
  return [
    {
      files,
      ignores: ['src/lib/modules.ts', ...TESTS, ...ignores],
      rules: restrict([...patterns, MODULES_BAN]),
    },
    {
      files: files.map((glob) => [glob, '**/*.test.{ts,tsx}']),
      ignores,
      rules: restrict(patterns),
    },
  ];
}

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
  ...layer(
    ['src/lib/db/**/*.{ts,tsx}'],
    [
      {
        group: [
          '@/lib/agent/**',
          '@/lib/store',
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
  ),
  ...layer(
    ['src/lib/agent/**/*.{ts,tsx}'],
    [
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
  ),
  ...layer(
    ['src/components/**/*.{ts,tsx}'],
    [
      {
        group: [
          '@/lib/api',
          '@/lib/api/**',
          '@/lib/openrouter',
          '@/lib/openrouter/**',
          '@/lib/anthropic',
          '@/lib/anthropic/**',
        ],
        message: 'UI components must not import transport clients.',
      },
      {
        // Model output is untrusted and BYOK keys live in the same origin,
        // so the markdown pipeline must never render raw HTML.
        group: ['rehype-raw'],
        message:
          'Rendering raw HTML from model output would expose the stored provider keys to any injected script.',
      },
    ],
  ),
  ...layer(
    [
      'src/lib/transport/**/*.{ts,tsx}',
      'src/lib/openrouter/**/*.{ts,tsx}',
      'src/lib/anthropic/**/*.{ts,tsx}',
      'src/lib/openaiCompat/**/*.{ts,tsx}',
    ],
    [
      {
        group: [
          '@/lib/agent',
          '@/lib/agent/**',
          '../agent/**',
          '../../agent/**',
          '../../../agent/**',
        ],
        message: 'Transport and provider adapters must not import agent modules.',
      },
    ],
  ),
  // Core outside the layers above still gets the module ban on its own.
  ...layer(
    ['src/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    [],
    [
      'src/lib/db/**',
      'src/lib/agent/**',
      'src/lib/transport/**',
      'src/lib/openrouter/**',
      'src/lib/anthropic/**',
      'src/lib/openaiCompat/**',
    ],
  ),
  {
    // `no-restricted-imports` sees neither dynamic imports nor relative
    // specifiers, so close both escape hatches here.
    files: CORE,
    ignores: ['src/lib/modules.ts', ...TESTS],
    rules: {
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
];
