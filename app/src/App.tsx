import { Routes, Route } from 'react-router'
import PocLanding from './pages/PocLanding'
import HomePage from './pages/home'
import ReactFlowPage from './pages/reactflow'
import TldrawPage from './pages/tldraw/TldrawPage'
import CanvasPage, { CanvasRedirect } from './pages/canvas'

export default function App() {
  return (
    <Routes>
      {/* 主页：workspace 总览（按 path 分组，卡片新标签页打开 /canvas/:id） */}
      <Route path="/" element={<HomePage />} />
      {/* PoC 对比落地页（原 /，保留入口） */}
      <Route path="/welcome" element={<PocLanding />} />
      {/* 实现标签点色：React Flow #61DAFB / tldraw #F5A524（§2.2.1） */}
      <Route path="/react-flow" element={<ReactFlowPage />} />
      <Route path="/tldraw" element={<TldrawPage />} />
      {/* 产品版：React Flow 蓝本接真实控制面（api-contract.md v0，herdr 驱动） */}
      <Route path="/canvas" element={<CanvasRedirect />} />
      <Route path="/canvas/:workspaceId" element={<CanvasPage />} />
    </Routes>
  )
}
