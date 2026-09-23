/**
 * tldraw 适配层 — shape 数据模型（与组件分离，满足 react-refresh 约束）
 */
import type { TLShape } from 'tldraw';
import { MOCK_NODES } from '@/shared';
import type { CanvasNodeDef } from '@/shared/types';

export const AGENT_NODE_TYPE = 'agent-node';

/* tldraw 5.x 全局 shape 类型注册：createShape/updateShape 获得类型校验 */
declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    [AGENT_NODE_TYPE]: { nodeId: string; w: number; h: number };
  }
}

export type AgentNodeShape = TLShape<typeof AGENT_NODE_TYPE>;

export const NODE_DEFS: Record<string, CanvasNodeDef> = Object.fromEntries(
  MOCK_NODES.map((d) => [d.id, d]),
);

export function shapeIdForNode(nodeId: string): AgentNodeShape['id'] {
  return `shape:${nodeId}` as AgentNodeShape['id'];
}

/** 委派关系（Coordinator → 子节点，§3.3.4） */
export const DELEGATION_IDS = ['n-artifact', 'n-op', 'n-chat-a', 'n-chat-r'];

/* 双击 shape → 进入专注：util 类无法访问 React context，经模块级回调桥接 */
let doubleClickHandler: ((nodeId: string) => void) | null = null;
export function setAgentNodeDoubleClickHandler(fn: ((nodeId: string) => void) | null): void {
  doubleClickHandler = fn;
}
export function fireAgentNodeDoubleClick(nodeId: string): void {
  doubleClickHandler?.(nodeId);
}
