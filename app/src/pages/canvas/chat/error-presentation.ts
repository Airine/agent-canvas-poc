/** Display-only redaction. Never mutate canonical evidence. */
export function redact(value: unknown): string {
  const source = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';
  return source
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[账户已隐藏]')
    .replace(/\bBearer\s+[a-z0-9._~+/-]+=*/gi, 'Bearer [已隐藏]')
    .replace(/((?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[已隐藏]')
    .replace(/([?&](?:key|token|api_key|access_token|secret|signature|sig|password)=)[^&#\s"']*/gi, '$1[已隐藏]')
    .replace(/\bsk-[a-z0-9_-]{8,}/gi, '[密钥已隐藏]');
}
export function errorTitle(error: unknown): string {
  const text = redact(error);
  if (/\b50[234]\b|connection error|请求上游失败/i.test(text)) return '模型服务请求失败';
  if (/\b429\b|rate.limit/i.test(text)) return '模型服务暂时限流';
  if (/\b40[13]\b|unauthorized/i.test(text)) return '模型服务拒绝了请求';
  return '本次回复失败';
}
export function safeLink(url: string): string | undefined {
  try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}
