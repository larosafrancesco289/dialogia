// Module: agent/prompts/toolPreamble
// Responsibility: Web-tool system prompt pieces — temporal grounding for any
// search provider, plus usage guidance for the Tavily web_search/web_fetch tools.

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// Models trained before "today" tend to treat the real date as a typo or a
// hypothetical and answer from stale memory; this notice pre-empts that.
export function buildSearchDateNotice(now: Date = new Date()): string {
  return [
    `Current date: ${DATE_FORMAT.format(now)}.`,
    'This date is correct even if it is later than your training data; do not "correct" it, treat it as hypothetical, or refuse on the grounds that it is in the future.',
    'Anything that happened after your knowledge cutoff is unknown to you, not nonexistent. For time-sensitive questions or events that may postdate your training, verify with web search instead of answering from memory, and tell the user when your unverified knowledge may be out of date.',
  ].join(' ');
}

export function buildToolPreamble(): string {
  return [
    'You have two function tools for the public web: "web_search" (Tavily Search) finds sources and returns numbered results with titles, URLs, and snippets; "web_fetch" (Tavily Extract) retrieves the full content of one specific URL.',
    [
      'Choosing a tool:',
      '- Use web_search to discover sources: news, prices, releases, schedules, statistics — anything time-sensitive, likely to postdate your training, or that the user asks you to look up.',
      '- Use web_fetch when you already have the URL: the user pasted a link, or a search result looks promising but its snippet is too thin to answer or quote accurately.',
      '- For non-trivial questions, work in two steps: search to find candidate sources, then fetch the one or two most promising URLs before answering. Snippets alone are rarely enough for claims you present as verified.',
      '- Answer from your own knowledge, without tools, when the subject is stable over time (concepts, mathematics, established history, writing code). Do not search reflexively.',
    ].join('\n'),
    [
      'Calling web_search:',
      "- Keep each query a short, focused phrase — not the user's whole message. Split multi-part questions into separate searches; you may issue up to 3 web_search calls in parallel, one per sub-question.",
      '- Put the timeframe in the query text itself (e.g. "June 2026"). Omit the freshness filter by default: it restricts to pages indexed within that window and narrow values often return zero results. Reserve "d"/"w" for breaking news.',
      '- If a search returns zero or weak results, do not give up or silently fall back to memory: retry once with a broader or rephrased query and no filters, then report what you could and could not verify.',
      '- Use country for region-specific queries and include_domains when the user names a site. Start with count 3-5.',
      'Calling web_fetch: pass the exact URL. Add a query to pull only the most relevant chunks from long pages; keep extract_depth "basic" unless tables or embedded content are missing.',
    ].join('\n'),
    [
      'Standards of evidence:',
      '- Do not settle for the first plausible snippet. For claims central to your answer, corroborate across at least two independent sources or web_fetch the primary source.',
      '- Prefer primary and authoritative sources over aggregators; prefer the most recent source when they disagree on time-sensitive facts.',
      '- If sources conflict, look stale, or coverage is thin, say so explicitly instead of papering over it.',
    ].join('\n'),
    'When you decide to call tools, respond with ONLY tool_calls (no user-facing text). Results arrive numbered; after the final tool result, write your answer citing sources inline as [n] using that numbering.',
  ].join('\n\n');
}
