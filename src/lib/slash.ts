import type { ModelDescriptor } from '@/lib/types';

export type SlashSuggestion = {
  title: string;
  insert: string;
  subtitle?: string;
};

export function getSlashSuggestions(input: string, models: ModelDescriptor[]): SlashSuggestion[] {
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

  // A command that takes an argument is offered with a space after it, ready for one.
  const baseCommands: Array<{ key: string; label: string; help?: string; takesArgument: boolean }> =
    [
      { key: 'model', label: 'model', help: 'Answer with another model', takesArgument: true },
      { key: 'search', label: 'search', help: 'Turn web search on or off', takesArgument: true },
      {
        key: 'reasoning',
        label: 'reasoning',
        help: 'How long the model thinks',
        takesArgument: true,
      },
      { key: 'help', label: 'help', help: 'What these commands do', takesArgument: false },
    ];
  const pushCommand = (command: (typeof baseCommands)[number]) =>
    push(`/${command.label}`, `/${command.key}${command.takesArgument ? ' ' : ''}`, command.help);

  if (!cmd) {
    for (const command of baseCommands) pushCommand(command);
    return suggestions;
  }

  const matching = baseCommands.filter((command) => startsWith(command.key, cmd));
  // Text that only starts with a slash ("/etc/hosts: …") is a message.
  if (matching.length === 0) return suggestions;
  if (arg === '' && !(matching.length === 1 && matching[0]?.key === cmd)) {
    for (const command of matching) pushCommand(command);
    return suggestions;
  }

  if (cmd === 'search') {
    const options = ['on', 'off', 'toggle'];
    const filtered = options.filter((option) => option.startsWith(arg.toLowerCase()));
    for (const option of filtered) push(`/search ${option}`, `/search ${option}`);
    return suggestions;
  }

  if (cmd === 'reasoning') {
    const options = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const filtered = options.filter((option) => option.startsWith(arg.toLowerCase()));
    for (const option of filtered) push(`/reasoning ${option}`, `/reasoning ${option}`);
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
    if (suggestions.length === 0 && arg === '') push('Type a model name…', `/model `);
    return suggestions;
  }

  if (cmd === 'help' && arg === '') {
    const help = baseCommands.find((command) => command.key === 'help');
    push('/help', '/help', help?.help);
  }
  return suggestions;
}

/**
 * What Return does while the list is up. A command with nothing left to type
 * runs at once: one typed out in full, the only suggestion left, or a
 * highlighted command that takes no argument (`/help`). Anything else is
 * completed, so the argument can be typed or picked next.
 */
export function slashEnterAction(
  value: string,
  suggestions: SlashSuggestion[],
  activeIndex: number,
): { run: string } | { complete: string } | null {
  const pick = suggestions[activeIndex] ?? suggestions[0];
  if (!pick) return null;
  const typed = value.trim();
  if (suggestions.some((s) => s.insert.trim() === typed)) return { run: typed };
  const awaitsArgument = pick.insert.endsWith(' ');
  const takesNoArgument = !pick.insert.includes(' ');
  if (!awaitsArgument && (suggestions.length === 1 || takesNoArgument)) {
    return { run: pick.insert };
  }
  return { complete: slashCompletion(pick) };
}

/** The composer's text once a suggestion is taken: a space after it, ready for more. */
export function slashCompletion(suggestion: SlashSuggestion): string {
  return suggestion.insert.endsWith(' ') ? suggestion.insert : `${suggestion.insert} `;
}
