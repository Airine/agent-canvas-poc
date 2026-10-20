export const ATTACHMENT_LIMITS = { count: 4, image: 2 * 1024 * 1024, text: 100 * 1024, request: 12 * 1024 * 1024 };
const encoder = new TextEncoder();
export function decodeAttachment(data) {
    if (typeof data !== 'string' || data.length > 3 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))
        throw new Error('附件不是有效的 base64 内容');
    const raw = atob(data);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export function attachmentText(a) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(decodeAttachment(a.data));
    }
    catch {
        throw new Error('文本附件必须是有效 UTF-8，不能静默替换错误编码');
    }
}
export function validateMessage(content, attachments = [], imageSupported) {
    if (typeof content !== 'string' || content.length > 100000 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content))
        throw new Error('消息文本无效或超过 100000 字符');
    if (!Array.isArray(attachments) || attachments.length > ATTACHMENT_LIMITS.count)
        throw new Error('每条消息最多 4 个附件');
    if (encoder.encode(JSON.stringify({ content, attachments })).length > ATTACHMENT_LIMITS.request)
        throw new Error('总请求不能超过 12 MiB');
    let textBytes = 0;
    const ids = new Set();
    for (const a of attachments) {
        if (!a || typeof a !== 'object' || Object.keys(a).some(k => !['id', 'name', 'mimeType', 'data'].includes(k)) || typeof a.id !== 'string' || !a.id || a.id.length > 128 || ids.has(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 160 || [...a.name].some(c => c.charCodeAt(0) < 32 || c === '/' || c === '\\'))
            throw new Error('附件标识或名称无效');
        ids.add(a.id);
        if (!['text/plain', 'image/png', 'image/jpeg', 'image/webp'].includes(a.mimeType) || /\.(svg|html?|xhtml|exe|sh|js)$/i.test(a.name))
            throw new Error('仅支持 UTF-8 纯文本及 PNG/JPEG/WebP，不接受可执行预览');
        const bytes = decodeAttachment(a.data);
        if (!bytes.length)
            throw new Error('附件不能为空');
        if (a.mimeType === 'text/plain') {
            textBytes += bytes.length;
            if (textBytes > ATTACHMENT_LIMITS.text)
                throw new Error('文本附件合计不能超过 100 KiB');
            if (attachmentText(a).includes('\0'))
                throw new Error('文本附件包含二进制 NUL');
        }
        else {
            if (bytes.length > ATTACHMENT_LIMITS.image)
                throw new Error('单张图片不能超过 2 MiB');
            const starts = (values) => values.every((v, i) => bytes[i] === v);
            const valid = a.mimeType === 'image/png' ? starts([137, 80, 78, 71, 13, 10, 26, 10]) && bytes.length >= 24
                : a.mimeType === 'image/jpeg' ? starts([255, 216, 255]) && bytes.length >= 4 && bytes.at(-2) === 255 && bytes.at(-1) === 217
                    : starts([82, 73, 70, 70]) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.slice(12, 16))) && bytes.length >= 20;
            if (!valid)
                throw new Error('图片签名与 MIME 不匹配');
            if (imageSupported === false)
                throw new Error('当前模型未确认支持图像输入，请选择支持图像的模型');
        }
    }
    if (!content.trim() && !attachments.length)
        throw new Error('消息不能为空');
    return { content, attachments: structuredClone(attachments) };
}
export function messageBlocks(content, attachments) {
    // Pi sendUserMessage joins all text blocks before creating its observed message.
    // Send that canonical content upfront so e can verify the exact consumption tuple.
    const text = [content, ...attachments.filter(a => a.mimeType === 'text/plain').map(a => `附件 · ${a.name}\n${attachmentText(a)}`)].filter(Boolean).join('\n');
    const images = attachments.filter(a => a.mimeType !== 'text/plain').map(a => ({type: 'image', mimeType: a.mimeType, data: a.data}));
    return images.length ? [{type: 'text', text}, ...images] : text;
}
