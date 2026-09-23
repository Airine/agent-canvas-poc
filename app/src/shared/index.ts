/**
 * 共享层统一出口（design.md §8.1）
 * 与画布引擎无关：两个路由（React Flow / tldraw）只允许各自写画布适配层。
 */
export * from './types';
export { MOCK_EDGES, MOCK_EVENTS, MOCK_NODES, MOCK_TOTAL } from './mock/events';
export { EventEngine, buildSnapshot } from './mock/engine';
export type { EngineState, PlaybackSpeed } from './mock/engine';
export {
  ViewModeManager,
  modeForScreenWidth,
  useAnimationsEnabled,
  useFocusedNodeId,
  useViewMode,
  L0_MAX_PX,
  L1_MAX_PX,
  ZOOM_DEBOUNCE_MS,
} from './ViewModeManager';
export { NODE_KIND_META, STATUS_COLORS } from './meta';
export { NodeShell } from './NodeShell';
export type { NodeShellProps } from './NodeShell';
export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps } from './StatusBadge';
export { WindowFrame } from './WindowFrame';
export type { LiveTier, WindowFrameProps } from './WindowFrame';
export { ArtifactView } from './ArtifactView';
export type { ArtifactViewProps } from './ArtifactView';
export { TerminalView } from './TerminalView';
export type { TerminalViewProps } from './TerminalView';
export { ChatView } from './ChatView';
export type { ChatViewProps } from './ChatView';
export { CoordinatorView } from './CoordinatorView';
export type { CoordinatorViewProps } from './CoordinatorView';
export { EdgeLegend } from './EdgeLegend';
export type { EdgeLegendProps } from './EdgeLegend';
export { PlaybackBar } from './PlaybackBar';
export type { PlaybackBarProps } from './PlaybackBar';
export { FocusOverlay } from './FocusOverlay';
export type { FocusOverlayProps } from './FocusOverlay';
