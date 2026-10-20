import { parse, stringify } from 'yaml';

export function parseWiki(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('Wiki page is missing YAML frontmatter');
  return { data: parse(match[1]), content: text.slice(match[0].length) };
}

export function stringifyWiki(content, data) {
  return `---\n${stringify(data)}---\n${content}`;
}
