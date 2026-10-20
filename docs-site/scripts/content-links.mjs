import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';

export function wikiUrl(file) {
  const slug = file.replace(/\.md$/, '').replace(/(^|\/)index$/, '');
  return `/docs${slug ? `/${slug.replace(/\/$/, '')}` : ''}`;
}

// Parse Markdown links instead of replacing strings inside examples/code blocks.
export function rewriteLinks(content, currentFile, wikiFiles) {
  const processor = unified().use(remarkParse).use(remarkStringify);
  const tree = processor.parse(content);
  visit(tree, (node) => {
    if (!['link', 'definition', 'image'].includes(node.type)) return;
    if (!node.url || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(node.url)) return;
    const [pathname, fragment] = node.url.split('#');
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(currentFile), decodeURIComponent(pathname)));
    if (wikiFiles.has(target)) node.url = `${wikiUrl(target)}${fragment ? `#${fragment}` : ''}`;
    else if (target === '../architecture.html') node.url = '/architecture.html';
    else throw new Error(`${currentFile}: unsupported relative link ${node.url}; link to a wiki page or use a code path`);
  });
  return processor.stringify(tree);
}
