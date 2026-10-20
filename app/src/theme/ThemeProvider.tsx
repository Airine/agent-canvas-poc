import type { ReactNode } from 'react';
import { ThemeProvider as Provider } from 'next-themes';
export function ThemeProvider({children}:{children:ReactNode}) {
 return <Provider attribute="class" storageKey="agent-canvas-theme" defaultTheme="system" enableSystem disableTransitionOnChange>{children}</Provider>;
}
