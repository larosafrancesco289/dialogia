import type { ORModel } from '@/lib/types';

export type SlashSuggestion = {
  title: string;
  insert: string;
  subtitle?: string;
};

export function getSlashSuggestions(input: string, models: ORModel[]): SlashSuggestion[] {
  const suggestions: SlashSuggestion[] = [];
  const value = (input || '').trimStart();
  if (!value.startsWith('/')) return suggestions;
  if (value.includes('\n')) return suggestions;

  const after = value.slice(1);
  const [rawCmd = '', ...rest] = after.split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const arg = rest.join(' ').trim();

  const push = (title: string, insert: string, subtitle?: string) => {
    suggestions.push({ title, insert, subtitle });
  };

  const startsWith = (candidate: string, prefix: string) => candidate.startsWith(prefix);

  const baseCommands: Array<{ key: string; label: string; help?: string }> = [
    { key: 'model', label: 'model', help: 'Set model by id or name' },
    { key: 'search', label: 'search', help: 'Toggle web search (on/off/toggle)' },
    { key: 'reasoning', label: 'reasoning', help: 'Set reasoning effort' },
    { key: 'help', label: 'help', help: 'Show slash command help' },
  ];

  if (!cmd) {
    for (const command of baseCommands) push(`/${command.label}`, `/${command.key} `, command.help);
    return suggestions;
  }

  const matching = baseCommands.filter((command) => startsWith(command.key, cmd));
  if (matching.length > 1 && arg === '') {
    for (const command of matching) push(`/${command.label}`, `/${command.key} `, command.help);
    return suggestions;
  }

  if (cmd === 'search') {
    const options = ['on', 'off', 'toggle'];
    const filtered = options.filter((option) => option.startsWith(arg.toLowerCase()));
    const values = filtered.length > 0 ? filtered : options;
    for (const option of values) push(`/search ${option}`, `/search ${option}`);
    return suggestions;
  }

  if (cmd === 'reasoning') {
    const options = ['none', 'low', 'medium', 'high'];
    const filtered = options.filter((option) => option.startsWith(arg.toLowerCase()));
    const values = filtered.length > 0 ? filtered : options;
    for (const option of values) push(`/reasoning ${option}`, `/reasoning ${option}`);
    return suggestions;
  }

  if (cmd === 'model') {
    const query = arg.toLowerCase();
    const choices = models
      .filter(
        (model) =>
          !query ||
          model.id.toLowerCase().includes(query) ||
          (model.name || '').toLowerCase().includes(query),
      )
      .slice(0, 8);
    for (const choice of choices) {
      push(choice.name || choice.id, `/model ${choice.id}`, choice.id);
    }
    if (suggestions.length === 0 && arg === '') push('Type a model id…', `/model `);
    return suggestions;
  }

  if ('help'.startsWith(cmd)) {
    push('/help', '/help', 'List supported slash commands');
    return suggestions;
  }

  for (const command of baseCommands) push(`/${command.label}`, `/${command.key} `, command.help);
  return suggestions;
}
