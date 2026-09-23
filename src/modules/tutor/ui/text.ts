// Topic names are title-like; mid-sentence, a leading article reads lower.
export const inSentence = (name: string) =>
  name.replace(/^(The|A|An) /, (article) => article.toLowerCase());
