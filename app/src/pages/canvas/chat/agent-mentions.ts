/** A caret-local query, never email addresses or an already completed name#hash reference. */
export function mentionQuery(text: string, start: number, end = start) {
  if (start !== end || start < 0 || start > text.length) return;
  const match = text.slice(0, start).match(/(?:^|[\s([{，。；：])@([^@\n#]{0,160})$/u);
  if (!match) return;
  return { start: start - match[1].length - 1, end: start, query: match[1].trim().toLocaleLowerCase() };
}
export function insertMention(text: string, range: {start: number; end: number}, reference: string) {
  const insertion = `${reference} `;
  return { text: text.slice(0, range.start) + insertion + text.slice(range.end), caret: range.start + insertion.length };
}
