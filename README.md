### Dialogia

Dialogia is a local-first chat UI for OpenRouter models.

### Why

- Keep prompts and history in the browser using IndexedDB
- Choose any OpenRouter model without vendor lock-in
- Simple UI with reasoning visibility and basic cost metrics

### Features

- Multi-chat sessions with rename and delete
- Model picker with curated and custom model ids
- Streaming responses with time-to-first-token and tokens per second
- Optional reasoning display for thinking models
- Basic cost estimate when pricing metadata is available
- Local persistence via Dexie (IndexedDB)

### Screenshots

![Front page](assets/frontpage.png)

![Model selection](assets/model-selection.png)

![Settings](assets/settings.png)

### Setup

Create `.env.local` at the project root:

```
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1_your_key_here
```

Install dependencies:

```
npm install
```

### Quickstart

Development server:

```
npm run dev
```

Build and start:

```
npm run build
npm start
```

Format and type-check:

```
npm run format
npm run lint:types
```

### Usage

1. Start the dev server
2. Open `http://localhost:3000`
3. Use the model picker in the header to select a model
4. Type in the composer and press Enter to send
5. Open Settings to adjust temperature, top_p, max_tokens, and reasoning options

### Architecture

- Framework: Next.js App Router with React 18
- State: Zustand with local persistence
- Storage: Dexie (IndexedDB)
- UI: lightweight CSS tokens and Tailwind v4 base
- Markdown: react-markdown with Prism, KaTeX, Mermaid

Code tree:

```
dialogia/
  app/
    layout.tsx
    page.tsx
    globals.css
  src/
    components/
      ChatPane.tsx
      ChatSidebar.tsx
      Composer.tsx
      MessageList.tsx
      ModelPicker.tsx
      SettingsDrawer.tsx
      ThemeToggle.tsx
      TopHeader.tsx
      WelcomeHero.tsx
    data/
      presets.ts
    lib/
      crypto.ts
      db.ts
      markdown.tsx
      openrouter.ts
      store.ts
      types.ts
    types/
      prism.d.ts
  styles/
    francesco-bootstrap.css
```

### License

MIT
