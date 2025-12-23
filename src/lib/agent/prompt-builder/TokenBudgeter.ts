import { estimateTokens } from '@/lib/tokenEstimate';

export class TokenBudgeter {
  constructor(
    private readonly maxTokens: number,
    private readonly reservedForCompletion: number = 1024,
  ) {}

  public budget(messages: { role: 'user' | 'assistant'; content: string }[]): number[] {
    const limit = Math.max(512, this.maxTokens - this.reservedForCompletion);
    const withTokens = messages.map((m, i) => ({
      originalIndex: i,
      tokens: estimateTokens(m.content) ?? 1,
    }));

    let running = 0;
    const keepIndices: number[] = [];

    // Iterate backwards
    for (let i = withTokens.length - 1; i >= 0; i--) {
      const t = withTokens[i].tokens;
      if (running + t > limit) break;
      keepIndices.push(i);
      running += t;
    }

    return keepIndices.sort((a, b) => a - b);
  }
}
