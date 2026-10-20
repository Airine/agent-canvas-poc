export type AgentId = 'lead' | 'research' | 'build' | 'review';
export type DemoStatus = 'queued' | 'running' | 'done' | 'waiting';
export type DemoPhase = 'ready' | 'running' | 'paused' | 'approval' | 'done' | 'rejected';

export interface DemoEvent {
  from: AgentId;
  to: AgentId;
  kind: string;
  text: string;
}

export interface DemoStep {
  title: string;
  statuses: Record<AgentId, DemoStatus>;
  event: DemoEvent;
  outputs?: Partial<Record<AgentId, string>>;
}

export const agents: Array<{ id: AgentId; title: string; role: string }> = [
  { id: 'lead', title: 'Lead · 主 Agent', role: '拆解任务 / 汇总交付' },
  { id: 'research', title: 'Research · 子 Agent', role: '分析需求 / 定义验收' },
  { id: 'build', title: 'Builder · 子 Agent', role: '实现方案 / 产物草稿' },
  { id: 'review', title: 'Reviewer · 审核 Agent', role: '交叉检查 / 人工交付门禁' },
];

export const steps: DemoStep[] = [
  {
    title: '等待任务启动',
    statuses: { lead: 'queued', research: 'queued', build: 'queued', review: 'queued' },
    event: { from: 'lead', to: 'lead', kind: '任务', text: '为 Agent Canvas 设计一个多 Agent 协作演示。' },
  },
  {
    title: '主 Agent 拆解任务',
    statuses: { lead: 'running', research: 'queued', build: 'queued', review: 'queued' },
    event: { from: 'lead', to: 'lead', kind: '计划', text: '拆分为需求分析与实现草稿；两位子 Agent 并行推进，Reviewer 负责交叉验收。' },
  },
  {
    title: '派发子任务 · 并行协作',
    statuses: { lead: 'waiting', research: 'running', build: 'running', review: 'queued' },
    event: { from: 'lead', to: 'research', kind: '委派', text: 'Research 定义验收清单；Builder 同时按共享目标制作界面草稿。' },
  },
  {
    title: 'Research 向 Builder 共享上下文',
    statuses: { lead: 'waiting', research: 'done', build: 'running', review: 'queued' },
    event: { from: 'research', to: 'build', kind: '上下文', text: '验收：区分主/子 Agent，展示并行状态、交接记录与人工审批；所有输出标明为模拟。' },
    outputs: { research: '需求清单（模拟产物）\n1. 主 Agent 拆解和委派任务\n2. 两个子 Agent 并行执行\n3. 显示上下文共享和回传\n4. 人工确认后才显示最终交付\n5. 明示演示数据，不调用模型' },
  },
  {
    title: 'Builder 回传产物',
    statuses: { lead: 'waiting', research: 'done', build: 'done', review: 'running' },
    event: { from: 'build', to: 'review', kind: '交接', text: '提交四节点画布、消息时间线和交付摘要草稿，请按 Research 清单审核。' },
    outputs: { build: '实现草稿（模拟产物）\nCanvas：Lead → Research / Builder → Reviewer\n交互：播放、暂停、单步、重置\n审计：记录委派、共享上下文、回传和审批\n安全：仅浏览器内回放，无文件写入或 Git 操作' },
  },
  {
    title: '审核完成 · 等待人工批准',
    statuses: { lead: 'waiting', research: 'done', build: 'done', review: 'waiting' },
    event: { from: 'review', to: 'lead', kind: '审核', text: '演示清单检查通过。请人工批准交付，或拒绝并结束本次演示。此处不是实际测试结果。' },
    outputs: { review: '审核报告（模拟产物）\n✓ 角色与分工明确\n✓ 并行任务可观察\n✓ 上下文交接可追踪\n✓ 等待人工批准\n注意：以上是预设剧本，不代表实际代码检查。' },
  },
  {
    title: '主 Agent 汇总 · 交付完成',
    statuses: { lead: 'done', research: 'done', build: 'done', review: 'done' },
    event: { from: 'review', to: 'lead', kind: '批准', text: '用户已批准演示交付。Lead 汇总两个子 Agent 的产物与审核报告。' },
    outputs: { lead: '交付摘要（模拟产物）\n目标：Canvas 内的多 Agent 协作\nResearch：提供 5 项验收要求\nBuilder：提供画布与交互草稿\nReviewer：完成演示审核，用户批准\n结果：演示完成。未启动真实子 Agent，未提交或合并代码。' },
  },
];

export interface DemoState { step: number; phase: DemoPhase }
export type DemoAction = 'play' | 'pause' | 'next' | 'tick' | 'approve' | 'reject' | 'reset';
export const initialDemoState: DemoState = { step: 0, phase: 'ready' };

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action === 'reset') return initialDemoState;
  if (action === 'approve' && state.phase === 'approval') return { step: 6, phase: 'done' };
  if (action === 'reject' && state.phase === 'approval') return { ...state, phase: 'rejected' };
  if (['approval', 'done', 'rejected'].includes(state.phase)) return state;
  if (action === 'play') return { ...state, phase: 'running' };
  if (action === 'pause' && state.phase === 'running') return { ...state, phase: 'paused' };
  if (action === 'next' || (action === 'tick' && state.phase === 'running')) {
    const step = Math.min(state.step + 1, 5);
    return { step, phase: step === 5 ? 'approval' : action === 'next' ? 'paused' : 'running' };
  }
  return state;
}

export function outputAt(step: number, id: AgentId): string {
  for (let index = step; index >= 0; index -= 1) {
    const output = steps[index].outputs?.[id];
    if (output) return output;
  }
  return '尚无产物。推进演示以查看此 Agent 的模拟输出。';
}
