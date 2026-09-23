/**
 * ChatView — 通用对话节点内容区（design.md §3.3.3）
 *
 * 渐进式披露三层 [R§5.1.1]：
 *  - todo 吸附面板（sticky 顶部，当前项 accent 色高亮 + 轻微脉冲）
 *  - tool call 默认折叠一行（32px：`▸ 图标 工具名(参数摘要) … 耗时/状态`），
 *    展开按类型定制渲染（search→结果列表 / edit→diff 红绿行 / bash→命令输出分块）；
 *    连续 >3 条同类工具调用自动折叠成「已折叠 N 条工具调用 ▾」[R§5.1.3]
 *  - 答复永显
 * approval 卡片：--st-waiting 色左竖条 + --surface-2 底；默认态按钮 disabled（观察权），
 * 专注模式才可点击——「权限随三态移交」的最直观演示 [R§2.1]。
 */
import { useMemo, useState, type ComponentType } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Pencil,
  Search,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ApprovalDecision, ChatItem, ChatNodeState, TodoItem, ToolCall } from './types';
import { WindowFrame, type LiveTier } from './WindowFrame';

/* ---------------- todo 吸附面板 ---------------- */

function TodoPanel({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null;
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle bg-surface-2/95 px-2 py-1.5 backdrop-blur-sm">
      {todos.map((todo) => (
        <span
          key={todo.id}
          className={cn(
            'flex items-center gap-1 text-node-meta',
            todo.status === 'done' && 'text-text-tertiary line-through',
            todo.status === 'pending' && 'text-text-secondary',
            todo.status === 'current' && 'animate-breathe text-accent',
          )}
        >
          {todo.status === 'done' && <CheckCircle2 className="size-3 text-st-completed" />}
          {todo.status === 'current' && <CircleDot className="size-3" />}
          {todo.status === 'pending' && <Circle className="size-3" />}
          {todo.text}
          {todo.status === 'current' && '（当前）'}
        </span>
      ))}
    </div>
  );
}

/* ---------------- tool call 折叠行（32px） ---------------- */

const TOOL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  search_web: Search,
  read_page: Search,
  edit: Pencil,
  bash: SquareTerminal,
};

function ToolCallDetail({ toolCall }: { toolCall: ToolCall }) {
  const d = toolCall.detail;
  if (!d) return null;
  if (d.type === 'search') {
    return (
      <ul className="space-y-0.5 px-2 py-1">
        {d.results.map((r, i) => (
          <li key={i} className="truncate text-node-meta text-text-secondary">· {r}</li>
        ))}
      </ul>
    );
  }
  if (d.type === 'edit') {
    return (
      <div className="space-y-0.5 px-2 py-1 font-mono text-node-meta">
        {d.diff.removed.map((l, i) => (
          <div key={`r${i}`} className="text-st-failed">{l}</div>
        ))}
        {d.diff.added.map((l, i) => (
          <div key={`a${i}`} className="text-st-completed">{l}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-0.5 px-2 py-1 font-mono text-node-meta">
      <div className="text-text-primary">$ {d.command}</div>
      <div className={cn(toolCall.status === 'failed' ? 'text-st-failed' : 'text-text-secondary')}>{d.output}</div>
    </div>
  );
}

function ToolCallRow({ toolCall }: { toolCall: ToolCall }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICONS[toolCall.tool] ?? Wrench;
  const failed = toolCall.status === 'failed';
  return (
    <div className="rounded-inner">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-full items-center gap-1.5 rounded-inner px-2 text-left text-node-meta transition-colors duration-fast hover:bg-surface-3',
          failed ? 'text-st-failed' : 'text-text-secondary',
        )}
      >
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Icon className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-mono">{toolCall.tool}</span>
          <span className="text-text-tertiary">({toolCall.argsSummary})</span>
        </span>
        <span className="tnum shrink-0">
          {failed ? '失败 ⚠' : toolCall.status === 'running' ? '运行中…' : toolCall.duration ?? ''}
        </span>
      </button>
      {open && (
        <div className="mx-2 mb-1 rounded-inner bg-surface-1">
          <ToolCallDetail toolCall={toolCall} />
        </div>
      )}
    </div>
  );
}

/** 连续 >3 条同类工具调用自动折叠（§3.3.3）[R§5.1.3] */
function ToolCallGroup({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center gap-1.5 rounded-inner px-2 text-left text-node-meta text-text-tertiary transition-colors duration-fast hover:bg-surface-3 hover:text-text-secondary"
      >
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        已折叠 {toolCalls.length} 条工具调用
      </button>
      {open && toolCalls.map((tc) => <ToolCallRow key={tc.id} toolCall={tc} />)}
    </div>
  );
}

type Block =
  | { type: 'single'; item: ChatItem; key: string }
  | { type: 'group'; toolCalls: ToolCall[]; key: string };

function groupItems(items: ChatItem[]): Block[] {
  const blocks: Block[] = [];
  let run: ToolCall[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.length > 3 && run.every((tc) => tc.tool === run[0].tool)) {
      blocks.push({ type: 'group', toolCalls: run, key: `g-${run[0].id}` });
    } else {
      for (const tc of run) blocks.push({ type: 'single', item: { type: 'toolcall', toolCall: tc }, key: tc.id });
    }
    run = [];
  };
  for (const item of items) {
    if (item.type === 'toolcall') {
      run.push(item.toolCall);
    } else {
      flush();
      blocks.push({ type: 'single', item, key: item.message.id });
    }
  }
  flush();
  return blocks;
}

/* ---------------- 主组件 ---------------- */

export interface ChatViewProps {
  title: string;
  state: ChatNodeState;
  tier?: LiveTier;
  observeOnly?: boolean;
  onActivate?: () => void;
  onFocus?: () => void;
  /** 专注模式 = true：approval 按钮可点击（权限随三态移交） */
  interactive?: boolean;
  onApproval?: (decision: ApprovalDecision) => void;
  className?: string;
}

export function ChatView({
  title,
  state,
  tier,
  observeOnly,
  onActivate,
  onFocus,
  interactive,
  onApproval,
  className,
}: ChatViewProps) {
  const blocks = useMemo(() => groupItems(state.items), [state.items]);
  const approval = state.approval;

  return (
    <WindowFrame
      title={title}
      tier={tier}
      observeOnly={observeOnly}
      onActivate={onActivate}
      onFocus={onFocus}
      className={className}
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <TodoPanel todos={state.todos} />
        <div className="min-h-0 flex-1 space-y-0.5 px-1 py-1">
          {blocks.length === 0 && (
            <div className="flex h-full items-center justify-center text-small text-text-tertiary">等待对话…</div>
          )}
          {blocks.map((block) => {
            if (block.type === 'group') return <ToolCallGroup key={block.key} toolCalls={block.toolCalls} />;
            const item = block.item;
            if (item.type === 'toolcall') return <ToolCallRow key={block.key} toolCall={item.toolCall} />;
            return (
              <div key={block.key} className="animate-delta-in px-2 py-1 text-body text-text-primary">
                <span className="text-node-meta text-text-tertiary">assistant: </span>
                {item.message.text}
              </div>
            );
          })}

          {/* approval 卡片（waiting 态来源）[R§2.1] */}
          {approval && (
            <div
              className="mx-1 my-1 rounded-inner border-l-2 bg-surface-2 p-2.5"
              style={{ borderLeftColor: 'var(--st-waiting)' }}
            >
              <div className="flex items-center gap-1.5 text-body text-text-primary">
                <span className="text-st-waiting">⏸</span>
                {approval.decision ? (
                  <span>
                    审批{approval.decision === 'approved' ? '已批准' : approval.decision === 'rejected' ? '已拒绝' : '已改需求'}：
                    <span className="text-text-secondary">{approval.reason}</span>
                  </span>
                ) : (
                  <span>等待批准：{approval.reason}</span>
                )}
              </div>
              {!approval.decision && (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!interactive}
                    onClick={() => onApproval?.('approved')}
                    className="h-7 bg-accent px-3 text-small text-white hover:bg-accent/90"
                  >
                    批准
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!interactive}
                    onClick={() => onApproval?.('rejected')}
                    className="h-7 border-st-failed bg-transparent px-3 text-small text-st-failed hover:bg-st-failed/10 hover:text-st-failed"
                  >
                    拒绝
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!interactive}
                    onClick={() => onApproval?.('edited')}
                    className="h-7 px-3 text-small text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  >
                    改需求
                  </Button>
                  {!interactive && (
                    <span className="text-node-meta text-text-tertiary">默认态只读 · 专注模式可操作</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </WindowFrame>
  );
}
