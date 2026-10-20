import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { COLLABORATION_CONTRACT, COLLABORATION_PROTOCOL_VERSION, COLLABORATION_EXTENSION_VERSION, COLLABORATION_SKILL, COLLABORATION_TOOL_NAMES, CollaborationError } from './collaboration-protocol.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
/** Node-only resource loader. No credentials, runtime data or global installation writes. */
export function readCollaborationPackage(skillPath = fileURLToPath(new URL('../../skills/canvas-collaboration/SKILL.md', import.meta.url))) {
  let skillText;
  try { const stat=fs.statSync(skillPath);if(!stat.isFile()||stat.size>65536)throw Error('invalid size');skillText=fs.readFileSync(skillPath,'utf8'); }
  catch { throw new CollaborationError('PROTOCOL_MISMATCH','Canvas collaboration Skill resource is missing or unreadable'); }
  const header=skillText.match(/^---\r?\n([\s\S]+?)\r?\n---(?:\r?\n|$)/)?.[1];
  const id=header?.match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1];
  const version=Number(header?.match(/^  version:\s*["']?(\d+)["']?\s*$/m)?.[1]);
  if(id!==COLLABORATION_SKILL.id||version!==COLLABORATION_SKILL.version)throw new CollaborationError('PROTOCOL_MISMATCH','Canvas Skill identity/version does not match the contract');
  const value={protocolVersion:COLLABORATION_PROTOCOL_VERSION,extensionVersion:COLLABORATION_EXTENSION_VERSION,contractHash:digest(JSON.stringify(COLLABORATION_CONTRACT)),skill:{id,version,hash:digest(skillText)},tools:[...COLLABORATION_TOOL_NAMES]};
  const manifest={...value,bundleHash:digest(JSON.stringify(value))};
  return {manifest,skillPath,skillText};
}
