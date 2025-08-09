export type ChatSettings = {
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  system?: string;
};

export type Message = {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  settings: ChatSettings;
};

export type ORModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: number; completion?: number; currency?: string };
  raw?: any;
};

export type KVRecord = {
  key: string;
  value: any;
};


