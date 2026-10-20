import { useTheme } from 'next-themes';
export function ThemeSwitcher() {
 const {theme,setTheme}=useTheme();
 return <label className="theme-switcher nodrag nowheel"><span>配色</span><select aria-label="主题配色" value={theme ?? 'system'} onChange={e=>setTheme(e.target.value)}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label>;
}
