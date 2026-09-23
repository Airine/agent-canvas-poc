/**
 * L0 全局模式 · 摘要卡（design.md §3.2.1）
 *
 * 独立轻量组件——【不是默认卡的缩小版】[R§2.2.1]：
 * 标题行 + 身份行 + 飞行记录器静态快照（最近产物 / 终端末 3 行 / 最近对话），
 * 不渲染任何活窗。状态徽章与耗时仍实时更新。
 * hover 浮层（--surface-3）：完整身份四元组 + 状态 + 最近事件摘要 +「双击进入专注」。
 */
import { StatusBadge } from '@/shared/StatusBadge';
import { NODE_KIND_META } from '@/shared/meta';
import type { CanvasNodeDef, NodeState } from '@/shared/types';

function snapshotText(def: CanvasNodeDef, state: NodeState): string[] {
  switch (def.kind) {
    case 'operation': {
      const lines = state.terminalLines.slice(-3).map((l) => l.text);
      return lines.length > 0 ? lines : ['等待输出…'];
    }
    case 'artifact': {
      const latest = state.artifact.versions[state.artifact.versions.length - 1];
      if (!latest) return ['尚无产物版本'];
      return [`产物 v${latest.v}${latest.label ? ` · ${latest.label}` : ''}`, '已定格为静态快照'];
    }
    case 'chat': {
      const last = [...state.chat.items].reverse().find((i) => i.type === 'message');
      return last && last.type === 'message' ? [last.message.text] : ['等待对话…'];
    }
    case 'coordinator':
      return ['4 个子任务 · 实时聚合'];
    default:
      return [];
  }
}

function latestEventSummary(def: CanvasNodeDef, state: NodeState): string {
  switch (def.kind) {
    case 'operation': {
      const l = state.terminalLines[state.terminalLines.length - 1];
      return l ? l.text : '暂无终端事件';
    }
    case 'artifact': {
      const v = state.artifact.versions[state.artifact.versions.length - 1];
      return v ? `产物版本 v${v.v}${v.label ? ` · ${v.label}` : ''}` : '暂无产物事件';
    }
    case 'chat': {
      const last = state.chat.items[state.chat.items.length - 1];
      if (!last) return '暂无对话事件';
      return last.type === 'message'
        ? last.message.text
        : `tool call：${last.toolCall.tool}(${last.toolCall.argsSummary})`;
    }
    default:
      return '编排进行中';
  }
}

export interface L0SummaryCardProps {
  def: CanvasNodeDef;
  state: NodeState;
  statusDetail?: string;
  selected?: boolean;
}

export function L0SummaryCard({ def, state, statusDetail, selected }: L0SummaryCardProps) {
  const meta = NODE_KIND_META[def.kind];
  const TypeIcon = meta.icon;
  const lines = snapshotText(def, state);

  return (
    <div
      data-l0-card
      data-status={state.status}
      className={
        'group/l0 relative flex h-full flex-col rounded-node bg-surface-1 shadow-node transition-[box-shadow] duration-fast' +
        (state.status === 'failed' ? ' shadow-failed' : '') +
        (state.status === 'skipped' ? ' node-skipped' : '') +
        (selected ? ' shadow-node-selected' : '')
      }
    >
      {state.status === 'failed' && (
        <span className="absolute -left-1.5 -top-1.5 z-10 flex size-4 items-center justify-center rounded-pill bg-st-failed text-[10px] font-bold leading-none text-white">
          !
        </span>
      )}

      {/* hover 浮层（浮于节点上方 8px，不改变节点本体） */}
      <div className="pointer-events-none absolute -top-2 left-0 z-10 hidden w-full -translate-y-full rounded-[8px] bg-surface-3 p-3 shadow-overlay group-hover/l0:block">
        <div className="text-node-title text-text-primary">{def.title}</div>
        <div className="mt-1 text-node-meta text-text-secondary">
          {def.identity.harness} · {def.identity.env} · {def.identity.agentId} · {def.identity.model}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <StatusBadge status={state.status} detail={statusDetail} />
        </div>
        <div className="mt-1.5 line-clamp-2 text-small text-text-tertiary">
          最近事件：{latestEventSummary(def, state)}
        </div>
        <div className="mt-1 text-small text-accent">双击进入专注</div>
      </div>

      {/* 标题行：类型点 + 标题 + 徽章 */}
      <div className="flex items-center gap-2 p-3 pb-2">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-inner"
          style={{
            backgroundColor: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
            color: meta.color,
          }}
        >
          <TypeIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-node-title text-text-primary">{def.title}</span>
        <StatusBadge status={state.status} detail={statusDetail} />
      </div>
      {/* 身份行 */}
      <div className="truncate px-3 text-node-meta text-text-secondary">
        {def.identity.harness} · {def.identity.env} · {def.identity.agentId}
      </div>
      {/* 飞行记录器静态快照 */}
      <div className="m-3 mt-2 min-h-0 flex-1 overflow-hidden rounded-inner bg-surface-2 p-2 font-mono text-node-meta text-text-tertiary">
        {lines.map((text, i) => (
          <div key={i} className="truncate">
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}
