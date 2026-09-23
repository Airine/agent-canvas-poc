/**
 * ApprovalCard — waiting 节点的审批卡片（契约 §2 POST /api/nodes/:id/approval）
 *
 * 视觉沿用 ChatView approval 卡片规范：--st-waiting 色 1px 左竖条 + --surface-2 底。
 * 权限随三态移交 [R§2.1]：默认态按钮 disabled（观察权）+ 提示文案；
 * 专注模式可点击 → POST decision → 本地进入「已提交」等待后端状态补丁（不做乐观更新，
 * 节点状态唯一事实来源是 WS node 补丁）。
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface ApprovalCardProps {
  nodeId: string;
  prompt: string;
  /** 专注模式 = true：按钮可点击 */
  interactive: boolean;
  onDecision: (nodeId: string, decision: 'approve' | 'reject') => Promise<void>;
}

export function ApprovalCard({ nodeId, prompt, interactive, onDecision }: ApprovalCardProps) {
  const [submitted, setSubmitted] = useState<'approve' | 'reject' | null>(null);

  const decide = (decision: 'approve' | 'reject') => {
    if (submitted) return;
    setSubmitted(decision);
    onDecision(nodeId, decision).catch((err: unknown) => {
      setSubmitted(null);
      toast.error('审批请求失败', {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  };

  return (
    <div
      className="rounded-inner border-l-2 bg-surface-2 p-2.5"
      style={{ borderLeftColor: 'var(--st-waiting)' }}
    >
      <div className="flex items-center gap-1.5 text-body text-text-primary">
        <span className="text-st-waiting">⏸</span>
        <span>等待批准：{prompt}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!interactive || submitted !== null}
          onClick={() => decide('approve')}
          className="h-7 bg-accent px-3 text-small text-white hover:bg-accent/90"
        >
          批准
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!interactive || submitted !== null}
          onClick={() => decide('reject')}
          className="h-7 border-st-failed bg-transparent px-3 text-small text-st-failed hover:bg-st-failed/10 hover:text-st-failed"
        >
          拒绝
        </Button>
        {submitted ? (
          <span className="text-node-meta text-text-tertiary">
            已提交{submitted === 'approve' ? '批准' : '拒绝'}，等待状态补丁…
          </span>
        ) : (
          !interactive && (
            <span className="text-node-meta text-text-tertiary">默认态只读 · 放大档/专注可操作</span>
          )
        )}
      </div>
    </div>
  );
}
