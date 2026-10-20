/** Historical decisions are evidence, not an allowlist that hides Knip findings. */
export function reconcileUnusedReview(records, candidates, hashAt) {
  const seen = new Set();
  return records.map(record => {
    if (seen.has(record.file) || !['remove', 'retain-uncommitted', 'retain-dependency'].includes(record.decision)) {
      throw new Error(`Invalid unused-file review record: ${record.file}`);
    }
    seen.add(record.file);
    const hash = hashAt(record.file);
    let status;
    if (record.decision === 'remove') status = hash === undefined ? 'removed' : 'changed';
    else if (hash !== record.sha256) status = 'changed';
    else status = candidates.has(record.file) ? record.decision : 'now-referenced';
    return { file: record.file, decision: record.decision, status };
  });
}
