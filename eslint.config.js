const js = require('@eslint/js');
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = [
  {
    ignores: ['node_modules', '.next', 'out', 'dist', 'tmp'],
  },
  ...compat.config({
    extends: ['./.eslintrc.json'],
  }),
];
