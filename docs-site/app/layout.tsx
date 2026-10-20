import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';

export const metadata: Metadata = {
  title: { template: '%s · Agent Canvas', default: 'Agent Canvas · 从画布看懂 Agent' },
  description: 'Agent Canvas 代码库文档：本地 Pi 会话、控制面、架构地图与可验证的代码证据。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN" suppressHydrationWarning><body className="flex min-h-screen flex-col"><RootProvider>{children}</RootProvider></body></html>;
}
