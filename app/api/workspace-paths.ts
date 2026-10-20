import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Both api/ and dist-api/ live under app/; never depend on the launcher's cwd.
export const PROJECT_ROOT = path.resolve(
  process.env.CANVAS_PROJECT_ROOT || fileURLToPath(new URL('../../', import.meta.url)),
);

/** Seed paths are relative to the checkout, not a developer's local machine. */
export function resolveSeedPath(seedPath: string, projectRoot = PROJECT_ROOT): string {
  return path.resolve(projectRoot, seedPath);
}

// Only these exact shipped examples may be migrated. Preserve custom paths,
// including valid Windows paths and records that reuse a seed's id.
const legacyExamples = [
  { id: 'ws-demo', title: 'Demo · 发布流水线', path: 'C:/projects/agent-canvas' },
  { id: 'ws-etl', title: 'Nightly ETL · 数据管道', path: 'C:/projects/nightly-etl' },
  { id: 'ws-research', title: '竞品调研 · 双 Agent 并行', path: 'C:/projects/agent-canvas' },
];

export function migrateLegacySeedPath(
  record: { id: string; title: string; path: string },
  projectRoot = PROJECT_ROOT,
): string {
  const isLegacyExample = legacyExamples.some((seed) =>
    seed.id === record.id && seed.title === record.title && seed.path === record.path,
  );
  return isLegacyExample ? resolveSeedPath('.', projectRoot) : record.path;
}
