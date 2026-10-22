import type { Attachment } from '../api/e/contracts';
import { validateMessage } from '../shared/message-content.mjs';

/** Browser-selected bytes only. No filesystem path from the renderer is read. */
export function createPiFileHost(owner: string) {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('canvas-native-attachments', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  async function store(path: string, value?: Attachment): Promise<Attachment> {
    if (!path.startsWith(`canvas-attachment/${owner}/`)) throw new Error('Foreign attachment');
    const database = await db;
    return new Promise((resolve, reject) => {
      const tx = database.transaction('files', value ? 'readwrite' : 'readonly');
      const req = value ? tx.objectStore('files').put(value, path) : tx.objectStore('files').get(path);
      tx.oncomplete = () => req.result ? resolve(value ?? req.result) : reject(new Error('Attachment expired. Please attach the file again.'));
      tx.onerror = () => reject(tx.error);
    });
  }
  const selections = new Map<string, File[]>();
  async function importFiles(files: Array<{name?: string; mimeType?: string; data: ArrayBuffer}>) {
    if (files.length > 4 || files.some(f => f.data.byteLength > 2 * 1024 * 1024)) throw new Error('At most 4 files, 2 MiB per image; text total 100 KiB.');
    const attachments = files.map(file => {
      const bytes = new Uint8Array(file.data); let raw = '';
      for (const b of bytes) raw += String.fromCharCode(b);
      const name = [...(file.name ?? 'attachment.txt')].map(c => c.charCodeAt(0) < 32 || c === '/' || c === '\\' ? '_' : c).join('');
      const mimeType = file.mimeType?.startsWith('image/') ? file.mimeType : 'text/plain';
      return {id: crypto.randomUUID(), name, mimeType, data: btoa(raw)} as Attachment;
    });
    validateMessage('', attachments);
    return {files: await Promise.all(attachments.map(async a => {
      const path = `canvas-attachment/${owner}/${a.id}/${encodeURIComponent(a.name)}`;
      await store(path, a);
      return {path, name:a.name, mimeType:a.mimeType, kind:a.mimeType.startsWith('image/')?'image':'file', size:atob(a.data).length};
    }))};
  }
  async function invoke(channel: string, input: Record<string, unknown> = {}) {
    if (input.sessionId !== undefined && input.sessionId !== owner) throw new Error('Foreign session');
    switch (channel) {
      case 'pi-desktop/composer/pickFiles': {
        const files = await new Promise<File[]>(resolve => {
          const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true;
          picker.accept = '.txt,.md,.json,.csv,.ts,.py,.png,.jpg,.jpeg,.webp'; picker.hidden = true;
          const done = (files: File[]) => { picker.remove(); resolve(files); };
          picker.onchange = () => done(Array.from(picker.files ?? [])); picker.oncancel = () => done([]);
          document.body.append(picker); picker.click();
        });
        if (!files.length) return {canceled:true, token:null};
        const token = crypto.randomUUID(); selections.set(token, files); return {token};
      }
      case 'pi-desktop/composer/importFiles': {
        const files = selections.get(String(input.token)); selections.delete(String(input.token));
        if (!files) throw new Error('File selection expired');
        if (files.length > 4 || files.some(f => f.size > 2 * 1024 * 1024)) throw new Error('At most 4 files, 2 MiB per image; text total 100 KiB.');
        return importFiles(await Promise.all(files.map(async file => ({name:file.name,mimeType:file.type,data:await file.arrayBuffer()}))));
      }
      case 'pi-desktop/composer/pasteFiles': return importFiles(input.files as Parameters<typeof importFiles>[0]);
      case 'pi-desktop/fs/readImageDataUrl': {
        const a = await store(String(input.ref));
        if (!a.mimeType.startsWith('image/')) throw new Error('Not an image');
        return {kind:'image', dataUrl:`data:${a.mimeType};base64,${a.data}`};
      }
      default: throw new Error(`Desktop service not connected: ${channel}`);
    }
  }
  return {invoke, read: (path: string) => store(path)};
}

/** Host confirmation, not a replacement for the original permission picker. */
export function confirmPermission(message: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    const text = document.createElement('p'); text.textContent = message;
    const yes = document.createElement('button'); yes.textContent = 'Allow permission change';
    const no = document.createElement('button'); no.textContent = 'Cancel';
    const done = (value: boolean) => { dialog.close(); dialog.remove(); resolve(value); };
    yes.onclick = () => done(true); no.onclick = () => done(false); dialog.oncancel = () => done(false);
    dialog.style.cssText = 'max-width:420px;padding:24px;border:1px solid #bbb;border-radius:14px;color:#222;background:white';
    dialog.append(text, no, yes); document.body.append(dialog); dialog.showModal();
  });
}
