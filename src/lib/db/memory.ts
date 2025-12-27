import type { Chat, Folder, KVRecord, Message } from '@/lib/types';

function cloneValue<T>(value: T): T {
  try {
    const g = globalThis as { structuredClone?: <U>(input: U) => U };
    if (g && typeof g.structuredClone === 'function') {
      return g.structuredClone(value);
    }
  } catch {
    // fall through to JSON fallback
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

class InMemoryCollection<T> {
  constructor(
    private readonly table: InMemoryTable<T>,
    private readonly predicate: (value: T) => boolean,
  ) {}

  private collect(): T[] {
    return this.table
      .entries()
      .filter(([, value]) => this.predicate(value))
      .map(([, value]) => cloneValue(value));
  }

  async toArray(): Promise<T[]> {
    return this.collect();
  }

  async sortBy<K extends keyof T>(field: K): Promise<T[]> {
    return this.collect().sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv);
      return 0;
    });
  }

  async delete(): Promise<number> {
    return this.table.deleteWhere(this.predicate);
  }
}

class InMemoryTable<T> {
  private data = new Map<string, T>();

  constructor(private readonly keyOf: (value: T) => string) {}

  async put(value: T) {
    this.data.set(this.keyOf(value), cloneValue(value));
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id);
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.data.values()).map((entry) => cloneValue(entry));
  }

  async get(id: string): Promise<T | undefined> {
    const found = this.data.get(id);
    return found ? cloneValue(found) : undefined;
  }

  entries(): [string, T][] {
    return Array.from(this.data.entries());
  }

  deleteWhere(predicate: (value: T) => boolean): number {
    let count = 0;
    for (const [key, value] of this.data.entries()) {
      if (predicate(value)) {
        this.data.delete(key);
        count += 1;
      }
    }
    return count;
  }

  where<K extends keyof T>(
    field: K,
  ): {
    equals(value: T[K]): InMemoryCollection<T>;
  };
  where(query: Partial<T>): InMemoryCollection<T>;
  where(fieldOrQuery: keyof T | Partial<T>) {
    if (typeof fieldOrQuery === 'string') {
      const field = fieldOrQuery as keyof T;
      return {
        equals: (value: T[keyof T]) =>
          new InMemoryCollection<T>(this, (entry) => entry[field] === value),
      } as { equals(value: T[keyof T]): InMemoryCollection<T> };
    }
    const query = fieldOrQuery as Partial<T>;
    const keys = Object.keys(query ?? {}) as (keyof T)[];
    return new InMemoryCollection<T>(this, (entry) =>
      keys.every((key) => entry[key] === query[key]),
    );
  }
}

export class InMemoryDialogiaDB {
  chats = new InMemoryTable<Chat>((chat) => chat.id);
  messages = new InMemoryTable<Message>((message) => message.id);
  folders = new InMemoryTable<Folder>((folder) => folder.id);
  kv = new InMemoryTable<KVRecord>((record) => record.key);

  async transaction(_mode: 'r' | 'rw', ...args: unknown[]) {
    const callback = args[args.length - 1];
    if (typeof callback !== 'function') return;
    const run = callback as (ctx: {
      table: <U>(name: string) => InMemoryTable<U>;
    }) => Promise<void> | void;
    await run({
      table: <U>(name: string) => {
        switch (name) {
          case 'chats':
            return this.chats as unknown as InMemoryTable<U>;
          case 'messages':
            return this.messages as unknown as InMemoryTable<U>;
          case 'folders':
            return this.folders as unknown as InMemoryTable<U>;
          case 'kv':
            return this.kv as unknown as InMemoryTable<U>;
          default:
            throw new Error(`Unknown table: ${name}`);
        }
      },
    });
  }
}

export function createMemoryDb() {
  return new InMemoryDialogiaDB();
}
