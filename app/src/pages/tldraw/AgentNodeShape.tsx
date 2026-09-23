/**
 * AgentNodeShape — tldraw 自定义 ShapeUtil（design.md §8.1 适配层）。
 * 渲染组件在 AgentNodeContent.tsx（与 util 类分离，满足 react-refresh 约束）。
 */
import { BaseBoxShapeUtil, T, type RecordProps } from 'tldraw';
import { AgentNodeComponent } from './AgentNodeContent';
import { AGENT_NODE_TYPE, fireAgentNodeDoubleClick, type AgentNodeShape } from './model';

export class AgentNodeShapeUtil extends BaseBoxShapeUtil<AgentNodeShape> {
  static override type = AGENT_NODE_TYPE;
  static override props: RecordProps<AgentNodeShape> = {
    nodeId: T.string,
    w: T.number,
    h: T.number,
  };

  override getDefaultProps(): AgentNodeShape['props'] {
    return { nodeId: '', w: 400, h: 340 };
  }

  /* 节点尺寸由内容驱动，禁手调 */
  override canResize(): boolean {
    return false;
  }
  override canEdit(): boolean {
    return false;
  }
  override canBind(): boolean {
    return false;
  }
  override hideResizeHandles(): boolean {
    return true;
  }

  /* 选中描边用共享 NodeShell 的 accent 2px（§3.1），隐藏 tldraw 默认选中框 */
  override hideSelectionBoundsFg(): boolean {
    return true;
  }

  /* 双击 = 进入专注模式（对齐 tldraw embed 先例） */
  override onDoubleClick(shape: AgentNodeShape): void {
    fireAgentNodeDoubleClick(shape.props.nodeId);
  }

  override component(shape: AgentNodeShape) {
    return <AgentNodeComponent shape={shape} />;
  }

  override getIndicatorPath(shape: AgentNodeShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
