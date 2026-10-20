import fs from 'node:fs';
import { COLLABORATION_TOOL_NAMES } from '../shared/collaboration-protocol.mjs';
import { readCollaborationPackage } from '../shared/collaboration-package.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
/** Local generated adapter: only the approval tool allowlist changes. ADE stays read-only. */
export function prepareCanvasAdapter(adeRoot, generationDir, toolsPath, pkg = readCollaborationPackage()) {
  const original = path.join(adeRoot, 'packages/e-pi-adapter/extensions/e-pi-adapter.ts');
  const source = fs.readFileSync(original, 'utf8');
  const anchor = 'const APPROVAL_TOOLS = new Set(["bash", "write", "edit"]);';
  if (source.split(anchor).length !== 2) throw new Error('unsupported e adapter approval hook; Canvas tools not enabled');
  const expanded = `const APPROVAL_TOOLS = new Set(${JSON.stringify(["bash", "write", "edit", ...COLLABORATION_TOOL_NAMES])});`;
  let patched = source.replace(anchor, expanded);
  patched = patched.replace(/from (["'])(\.[^"']+)\1/g, (_, quote, relative) => `from ${JSON.stringify(path.resolve(path.dirname(original), relative))}`);
  const adapter = path.join(generationDir, 'canvas-e-adapter.ts');
  fs.writeFileSync(adapter, `// Canvas generated; ADE sha256 ${createHash('sha256').update(source).digest('hex')}\n${patched}`, { mode: 0o600 });
  const extension = path.join(generationDir, 'canvas-tools.ts');
  fs.writeFileSync(extension, `import { setCloseOnExec } from ${JSON.stringify(path.join(adeRoot, 'packages/e-pi-adapter/src/fd-cloexec.ts'))};\nimport install from ${JSON.stringify(toolsPath)};\nexport default pi => install(pi, setCloseOnExec, ${JSON.stringify(pkg.manifest)});\n`, { mode: 0o600 });
  return { adapter, extension };
}
