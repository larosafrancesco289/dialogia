'use client';
import { useChatStore } from '@/lib/store';
import { useMemo } from 'react';

export function UsageStatsPanel() {
  const chats = useChatStore((s) => s.chats);
  const messages = useChatStore((s) => s.messages);

  const stats = useMemo(() => {
    let totalMessages = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    for (const chat of chats) {
      const chatMessages = messages[chat.id] ?? [];
      totalMessages += chatMessages.length;
      for (const msg of chatMessages) {
        if (msg.role === 'assistant') {
          totalTokensIn += msg.tokensIn ?? 0;
          totalTokensOut += msg.tokensOut ?? 0;
        }
      }
    }

    return {
      totalChats: chats.length,
      totalMessages,
      totalTokens: totalTokensIn + totalTokensOut,
      totalTokensIn,
      totalTokensOut,
    };
  }, [chats, messages]);

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="text-2xl font-semibold text-foreground">{formatNumber(stats.totalChats)}</div>
          <div className="text-sm text-muted-foreground">Total Chats</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="text-2xl font-semibold text-foreground">{formatNumber(stats.totalMessages)}</div>
          <div className="text-sm text-muted-foreground">Messages</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="text-2xl font-semibold text-foreground">{formatNumber(stats.totalTokensIn)}</div>
          <div className="text-sm text-muted-foreground">Tokens In</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="text-2xl font-semibold text-foreground">{formatNumber(stats.totalTokensOut)}</div>
          <div className="text-sm text-muted-foreground">Tokens Out</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Statistics are calculated from locally stored chat history.
      </p>
    </div>
  );
}
