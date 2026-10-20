import type { ITheme } from 'xterm';
/** Read resolved tokens; xterm canvas renderers cannot resolve CSS var strings. */
export function terminalTheme(): ITheme {
 const style=getComputedStyle(document.documentElement);
 const color=(name:string)=>style.getPropertyValue(name).trim();
 return {
  background:color('--terminal-bg'),foreground:color('--terminal-fg'),cursor:color('--terminal-fg'),cursorAccent:color('--terminal-bg'),selectionBackground:color('--terminal-selection'),
  black:color('--terminal-black'),white:color('--terminal-white'),brightBlack:color('--terminal-bright-black'),brightWhite:color('--terminal-bright-white'),
  red:color('--st-failed'),green:color('--st-completed'),yellow:color('--st-waiting'),blue:color('--st-running'),magenta:color('--accent'),cyan:color('--nt-artifact'),
  brightRed:color('--st-failed'),brightGreen:color('--st-completed'),brightYellow:color('--st-waiting'),brightBlue:color('--st-running'),brightMagenta:color('--accent'),brightCyan:color('--nt-artifact'),
 };
}
