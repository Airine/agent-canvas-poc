import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { source } from '@/lib/source';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const MDX = page.data.body;
  return <DocsPage toc={page.data.toc} full={page.data.full}>
    <DocsTitle>{page.data.title}</DocsTitle>
    <DocsDescription>{page.data.description}</DocsDescription>
    <DocsBody><MDX components={defaultMdxComponents} /></DocsBody>
    {page.data.sources?.length ? <details className="source-evidence"><summary>代码依据 · {page.data.sources.length} 个来源</summary><p>记录的是工作区文件的 Git blob 哈希。运行 architecture:verify 检查是否过期。</p><ul>{page.data.sources.map((entry) => <li key={entry}><code>{entry}</code></li>)}</ul></details> : null}
  </DocsPage>;
}

export function generateStaticParams() { return source.generateParams(); }
export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
