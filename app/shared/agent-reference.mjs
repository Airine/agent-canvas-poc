/** Stable across renames; display suffixes and copyable references share one allocator. */
export function identityHash(value) {
  let hash = 0x811c9dc5;
  for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function sessionIdentities(sources, workspaceId, hash = identityHash) {
  const peers = sources.filter(source => source.workspaceId === workspaceId);
  const names = new Map(peers.map(p => [p.nodeId, p.title.trim().normalize('NFC') || 'Agent']));
  const hashes = new Map(peers.map(p => [p.nodeId, hash(JSON.stringify([workspaceId, p.nodeId]))]));
  return new Map(peers.map(p => {
    const nickname = names.get(p.nodeId), digest = hashes.get(p.nodeId);
    let length = Math.min(6, digest.length);
    const collides = () => peers.some(o => o.nodeId !== p.nodeId && hashes.get(o.nodeId).slice(0, length) === digest.slice(0, length));
    while (length < digest.length && collides()) length++;
    const fallback = collides() ? `-${Array.from(p.nodeId, c => c.codePointAt(0).toString(16)).join('.')}` : '';
    const suffix = peers.some(o => o.nodeId !== p.nodeId && names.get(o.nodeId) === nickname) ? `@${digest.slice(0, length)}${fallback}` : '';
    const referenceHash = `${digest}${fallback}`;
    return [p.nodeId, { nickname, suffix, displayTitle: suffix ? `${nickname} ${suffix}` : nickname,
      referenceHash, reference: `@${JSON.stringify(nickname)}#${referenceHash}` }];
  }));
}
/** Names are descriptive only. Never resolve a stale/ambiguous hash by guessing a name. */
export function resolveAgentReference(sources, workspaceId, reference) {
  if (typeof reference !== 'string' || reference.length > 600) throw new Error('invalid Agent reference');
  const token = reference.trim().match(/(?:^#?|#)([a-f0-9]{8}(?:-[a-f0-9.]+)?)$/)?.[1];
  if (!token) throw new Error('use the copied name+hash reference or an exact hash from canvas_agents');
  const matches = [...sessionIdentities(sources, workspaceId)].filter(([, v]) => v.referenceHash === token);
  if (matches.length !== 1) throw new Error('Agent reference missing or ambiguous in this Canvas; refresh canvas_agents');
  return matches[0][0];
}
