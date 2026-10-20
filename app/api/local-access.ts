/** Local HTTP/WS boundary: reject DNS rebinding and cross-origin controls. */
const port = Number(process.env.PORT || 3000);
const uiPort = Number(process.env.CANVAS_UI_PORT || 5173);
const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
export function localRequestAllowed(host: string | undefined, origin?: string | null): boolean {
  try {
    if (!host) return false;
    const target = new URL(`http://${host}`);
    if (!hosts.has(target.hostname) || Number(target.port || 80) !== port) return false;
    if (!origin) return true; // local non-browser CLI/testing
    const source = new URL(origin);
    return source.protocol === 'http:' && hosts.has(source.hostname) && [port, uiPort].includes(Number(source.port || 80));
  } catch { return false; }
}
