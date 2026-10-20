/**
 * 主页 `/` — Agent Canvas workspace 总览（冻结契约 WorkspaceSummary）
 *
 * 数据源：live-store 同款逻辑 GET /api/workspaces，失败回退浏览器内 mock（徽标明示）。
 * 布局：顶部产品名；主体按 path 分组聚合（同 path = 同项目），每组项目路径标题 +
 * workspace 卡片网格。卡片 = 迷你预览（GraphPreview 只读 schematic）+ title +
 * description + status 徽章（六态配色）+ lastActiveAt 相对时间。
 * 打开方式：卡片点击 / 「打开」一律 window.open('/canvas/'+id, '_blank') ——
 * 刻意用浏览器新标签页做 Canvas 切换（产品决策）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Diamond, Folder, FolderGit2, Loader2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWorkspaces, type WorkspaceSummary } from '@/pages/canvas/live-store';
import { GraphPreview } from './GraphPreview';
import { CreateSessionForm } from './CreateSessionForm';

/* ---------------- status 徽章（workspace 四态 → 复用六态配色） ---------------- */

const WS_STATUS_META: Record<
  WorkspaceSummary['status'],
  { label: string; color: string; bg: string }
> = {
  idle: {
    label: 'idle',
    color: 'var(--st-queued)',
    bg: 'color-mix(in srgb, var(--st-queued) 14%, transparent)',
  },
  running: {
    label: 'running',
    color: 'var(--st-running)',
    bg: 'color-mix(in srgb, var(--st-running) 18%, transparent)',
  },
  done: {
    label: 'done',
    color: 'var(--st-completed)',
    bg: 'color-mix(in srgb, var(--st-completed) 14%, transparent)',
  },
  failed: {
    label: 'failed',
    color: 'var(--st-failed)',
    bg: 'color-mix(in srgb, var(--st-failed) 14%, transparent)',
  },
};

function WorkspaceStatusBadge({ status }: { status: WorkspaceSummary['status'] }) {
  const meta = WS_STATUS_META[status];
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-pill px-2 text-node-meta leading-none"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      <span className="size-1.5 rounded-pill" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

/* ---------------- 相对时间 ---------------- */

function fmtRelative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString();
}

/* ---------------- workspace 卡片 ---------------- */

function openCanvas(id: string) {
  window.open(`/canvas/${id}`, '_blank');
}

function WorkspaceCard({ ws, now }: { ws: WorkspaceSummary; now: number }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openCanvas(ws.id)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openCanvas(ws.id);
        }
      }}
      className="group flex cursor-pointer flex-col rounded-node border border-border-subtle bg-surface-1 p-4 transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:border-accent/50"
      title={`新标签页打开 ${ws.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-focus-title leading-6">{ws.title}</span>
        <WorkspaceStatusBadge status={ws.status} />
      </div>
      <p className="mt-1.5 line-clamp-2 min-h-10 text-body text-text-secondary">{ws.description}</p>
      <div className="mt-3 h-28 overflow-hidden rounded-inner border border-border-subtle bg-canvas-bg">
        <GraphPreview graph={ws.graph} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="tnum text-small text-text-tertiary">
          最后活跃 {fmtRelative(ws.lastActiveAt, now)}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-border-subtle bg-transparent px-2.5 text-small text-text-secondary hover:bg-accent-soft hover:text-accent group-hover:border-accent/50"
          onClick={(e) => {
            e.stopPropagation();
            openCanvas(ws.id);
          }}
        >
          打开
        </Button>
      </div>
      <div className="mt-2 flex gap-3 text-small">
        <button onClick={async e => {
          e.stopPropagation();const title = window.prompt('工作区名称', ws.title);if (!title?.trim()) return;
          const res = await fetch(`/api/workspaces/${ws.id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});
          if(!res.ok){window.alert((await res.json()).error);return;}window.location.reload();
        }}>重命名</button>
        <button onClick={async e => {
          e.stopPropagation();if(!ws.archivedAt && !window.confirm('归档会停止本工作区的 Agent，但保留全部历史。继续？'))return;
          const res = await fetch(`/api/workspaces/${ws.id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:!ws.archivedAt})});
          if(!res.ok){window.alert((await res.json()).error);return;}window.location.reload();
        }}>{ws.archivedAt ? '恢复工作区' : '归档'}</button>
      </div>
    </div>
  );
}

/* ---------------- 页面 ---------------- */

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [source, setSource] = useState<'api' | 'mock'>('api');
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    void fetchWorkspaces().then((res) => {
      if (!alive) return;
      setWorkspaces(res.workspaces);
      setLoadError(res.error ?? '');
      setSource(res.source);
      setNow(Date.now());
    });
    return () => {
      alive = false;
    };
  }, []);

  /** path 分组聚合（同 path = 同项目），组内按 lastActiveAt 最新在前 */
  const groups = useMemo(() => {
    const byPath = new Map<string, WorkspaceSummary[]>();
    for (const ws of workspaces ?? []) {
      const group = `${ws.backend === 'e' ? '真实 e 会话' : ws.source === 'demo' || !ws.source ? '示例拓扑' : 'herdr 工作区'} · ${ws.path}`;
      const list = byPath.get(group) ?? [];
      list.push(ws);
      byPath.set(group, list);
    }
    return [...byPath.entries()]
      .map(([path, list]) => ({
        path,
        list: [...list].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)),
        lastActiveAt: list.reduce((max, w) => (w.lastActiveAt > max ? w.lastActiveAt : max), ''),
      }))
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }, [workspaces]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas-bg text-text-primary">
      {/* 顶栏：产品名 + 数据源徽标 */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex items-center gap-2">
          <Diamond className="size-4 text-accent" fill="currentColor" />
          <span className="text-focus-title">Agent Canvas</span>
          <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-node-meta text-accent">主页</span>
        </div>
        {source === 'mock' && (
          <span className="flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-small text-text-secondary shadow-node">
            <Radio className="size-3 text-st-waiting" />
            离线示例（非真实运行）
          </span>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-16">
        <nav className="mt-5 flex gap-4 text-small"><a href="/">工作区</a><a href="/?view=archived">归档</a><a href="/?view=examples">示例 / herdr 兼容入口</a></nav>
        <CreateSessionForm/>
        {loadError && <p role="alert">{loadError} <button onClick={()=>window.location.reload()}>重试</button></p>}
        <p className="mt-6 text-small text-text-secondary">
          创建真实 Agent 会话，在画布内执行任务；工具操作需人工审批。示例拓扑仅在独立示例入口展示。
        </p>
        {workspaces === null ? (
          <div className="flex h-64 items-center justify-center gap-2 text-body text-text-secondary">
            <Loader2 className="size-4 animate-spin" />
            正在加载 workspaces…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-body text-text-secondary">
            <Folder className="size-6 text-text-tertiary" />
            暂无 workspace
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.path} className="pt-10">
              {/* 项目分组头：path 标题 + 组内数量 */}
              <div className="flex items-center gap-2">
                <FolderGit2 className="size-4 text-accent" />
                <span className="font-mono text-mono text-text-primary">{group.path}</span>
                <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-node-meta text-text-tertiary">
                  {group.list.length} 个 workspace
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.list.map((ws) => (
                  <WorkspaceCard key={ws.id} ws={ws} now={now} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <footer className="flex h-10 shrink-0 items-center justify-center border-t border-border-subtle text-small text-text-tertiary">
        点击卡片在浏览器新标签页打开对应 Canvas
      </footer>
    </div>
  );
}
