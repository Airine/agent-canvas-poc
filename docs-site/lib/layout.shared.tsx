import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Blocks } from 'lucide-react';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <><Blocks size={20} /><span>Agent Canvas <span className="brand-suffix">/ docs</span></span></> },
    links: [
      { text: '阅读文档', url: '/docs' },
      { text: '架构地图', url: '/architecture.html', external: true },
      { text: '代码体检', url: '/docs/health' },
    ],
  };
}
