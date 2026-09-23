/**
 * registry.ts — multi-workspace registry.
 *
 * One Canvas = one workspace record. Persisted as JSON at
 * app/api/data/workspaces.json; seeded from app/api/graphs/*.json on first
 * boot (when the data file is missing). Each record owns a live GraphStore
 * (graph.ts) so runs mutate the same graph the summaries expose.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Graph, WorkspaceStatus, WorkspaceSummary } from './types.js';
import { normalizeGraph, registerGraphStore, getGraphStore } from './graph.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(API_ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'workspaces.json');
const SEEDS_DIR = path.join(API_ROOT, 'graphs');

interface WorkspaceRecord {
  id: string;
  title: string;
  path: string;
  description: string;
  createdAt: string;
  lastActiveAt: string;
  graph: Graph;
}

interface SeedFile {
  id?: string;
  title: string;
  path: string;
  description: string;
  graph: Graph;
}

/**
 * A server restart kills every live run, so a persisted mid-run graph must
 * not survive loading: GraphStore snapshots the loaded graph as `initial`
 * and reset() deep-clones that snapshot — loading runState 'running'/'done'
 * verbatim would make reset() restore the dirty state and run() no-op on the
 * 'running'/'done' guard, wedging the workspace until the data file is
 * deleted by hand. Force every loaded graph back to a clean queued slate.
 */
function sanitizeLoadedGraph(g: Graph): void {
  g.runState = 'idle';
  for (const n of g.nodes) {
    if (n.status !== 'queued') n.status = 'queued';
    delete n.paneId;
    delete n.progress;
    delete n.statusReason;
    delete n.approval;
    delete n.startedAt;
    delete n.endedAt;
  }
}

class Registry {
  private records = new Map<string, WorkspaceRecord>();
  private activeId: string | null = null;

  constructor() {
    this.load();
  }

  // -- persistence -----------------------------------------------------------

  private load(): void {
    let loaded = false;
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as { workspaces?: WorkspaceRecord[] };
      for (const rec of raw.workspaces ?? []) {
        rec.graph = normalizeGraph(rec.graph);
        sanitizeLoadedGraph(rec.graph);
        this.records.set(rec.id, rec);
      }
      loaded = this.records.size > 0;
    } catch {
      /* missing or corrupt file -> seed */
    }
    if (!loaded) this.loadSeeds();
    for (const rec of this.records.values()) {
      registerGraphStore(rec.id, rec.graph);
    }
    this.activeId = [...this.records.keys()].at(-1) ?? null;
    if (!loaded) this.save();
  }

  private loadSeeds(): void {
    let files: string[] = [];
    try {
      files = fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.json')).sort();
    } catch {
      return;
    }
    const now = new Date().toISOString();
    for (const f of files) {
      try {
        const seed = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, f), 'utf8')) as SeedFile;
        const id = seed.id || this.newId();
        this.records.set(id, {
          id,
          title: seed.title,
          path: seed.path,
          description: seed.description,
          createdAt: now,
          lastActiveAt: now,
          graph: normalizeGraph(seed.graph),
        });
      } catch (e) {
        console.warn(`[registry] skipping seed ${f}: ${e}`);
      }
    }
  }

  private save(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const workspaces = [...this.records.values()].map((rec) => ({
      ...rec,
      graph: getGraphStore(rec.id)?.graph ?? rec.graph,
    }));
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ workspaces }, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  }

  // -- queries ---------------------------------------------------------------

  private newId(): string {
    return `ws-${crypto.randomUUID().slice(0, 8)}`;
  }

  private statusOf(id: string): WorkspaceStatus {
    const g = getGraphStore(id)?.graph ?? this.records.get(id)?.graph;
    if (!g) return 'idle';
    if (g.runState === 'running') return 'running';
    if (g.runState === 'done') {
      return g.nodes.some((n) => n.status === 'failed') ? 'failed' : 'done';
    }
    return 'idle';
  }

  private summaryOf(rec: WorkspaceRecord): WorkspaceSummary {
    return {
      id: rec.id,
      title: rec.title,
      path: rec.path,
      description: rec.description,
      createdAt: rec.createdAt,
      lastActiveAt: rec.lastActiveAt,
      status: this.statusOf(rec.id),
      graph: getGraphStore(rec.id)?.graph ?? rec.graph,
    };
  }

  list(): WorkspaceSummary[] {
    return [...this.records.values()].map((r) => this.summaryOf(r));
  }

  get(id: string): WorkspaceSummary | undefined {
    const rec = this.records.get(id);
    if (!rec) return undefined;
    this.touch(id);
    return this.summaryOf(rec);
  }

  getGraph(id: string): Graph | undefined {
    const rec = this.records.get(id);
    if (!rec) return undefined;
    this.touch(id);
    return getGraphStore(id)?.graph ?? rec.graph;
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  /** Last created / last requested workspace = the active one. */
  getActiveId(): string {
    if (this.activeId && this.records.has(this.activeId)) return this.activeId;
    this.activeId = [...this.records.keys()].at(-1) ?? '';
    return this.activeId;
  }

  setActive(id: string): void {
    if (this.records.has(id)) this.touch(id);
  }

  private touch(id: string): void {
    const rec = this.records.get(id);
    if (!rec) return;
    rec.lastActiveAt = new Date().toISOString();
    this.activeId = id;
  }

  /** Persist current live state (called on create and after run transitions). */
  persist(): void {
    this.save();
  }

  create(input: { title: string; path: string; description: string; graph: Graph }): WorkspaceSummary {
    const now = new Date().toISOString();
    const rec: WorkspaceRecord = {
      id: this.newId(),
      title: input.title,
      path: input.path,
      description: input.description,
      createdAt: now,
      lastActiveAt: now,
      graph: normalizeGraph(input.graph),
    };
    this.records.set(rec.id, rec);
    registerGraphStore(rec.id, rec.graph);
    this.activeId = rec.id;
    this.save();
    return this.summaryOf(rec);
  }
}

export const registry = new Registry();
