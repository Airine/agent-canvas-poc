/**
 * Minimap — 右下角自绘 200×130px Canvas 像素点 minimap（design.md §2.2.3）
 *
 * 节点色块用状态色（六态冗余通道），视口框 --border-strong。
 * zoom < 0.25 时不随 LOD 隐藏。点击 minimap 将视口中心平移到对应位置。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useEditor, useValue } from 'tldraw';
import { MOCK_NODES } from '@/shared';
import { shapeIdForNode } from './model';
import { useCanvasServices } from './context';

const W = 200;
const H = 130;
const PAD = 10;


export function Minimap() {
  const editor = useEditor();
  const services = useCanvasServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const geo = useValue(
    'minimap-geo',
    () => {
      const nodes = MOCK_NODES.map((def) => {
        const b = editor.getShapePageBounds(shapeIdForNode(def.id));
        return b ? { id: def.id, x: b.x, y: b.y, w: b.w, h: b.h } : null;
      }).filter((n): n is NonNullable<typeof n> => n !== null);
      const vp = editor.getViewportPageBounds();
      return { nodes, viewport: { x: vp.x, y: vp.y, w: vp.w, h: vp.h } };
    },
    [editor],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || geo.nodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const tokens = getComputedStyle(document.documentElement);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* 世界包围盒（节点 ∪ 视口） → minimap 坐标 */
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of [...geo.nodes, geo.viewport]) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const scale = Math.min((W - PAD * 2) / (maxX - minX), (H - PAD * 2) / (maxY - minY));
    const ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (H - (maxY - minY) * scale) / 2 - minY * scale;

    /* 节点色块（状态色） */
    for (const n of geo.nodes) {
      const status = services.snapshot.nodes[n.id]?.status ?? 'queued';
      ctx.fillStyle = tokens.getPropertyValue(`--st-${status}`).trim();
      ctx.globalAlpha = status === 'queued' ? 0.45 : 1;
      ctx.fillRect(n.x * scale + ox, n.y * scale + oy, Math.max(3, n.w * scale), Math.max(2, n.h * scale));
    }
    ctx.globalAlpha = 1;
    /* 视口框 --border-strong */
    ctx.strokeStyle = tokens.getPropertyValue('--border-strong').trim();
    ctx.lineWidth = 1;
    ctx.strokeRect(
      geo.viewport.x * scale + ox,
      geo.viewport.y * scale + oy,
      geo.viewport.w * scale,
      geo.viewport.h * scale,
    );
  }, [geo, services.snapshot]);

  useEffect(() => {
    draw();
    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="画布 minimap"
      style={{
        width: W,
        height: H,
        borderRadius: 'var(--r-inner)',
        backgroundColor: 'var(--surface-2)',
        boxShadow: 'var(--shadow-node)',
        cursor: 'crosshair',
        pointerEvents: 'all',
      }}
      onPointerDown={(e) => {
        /* 点击平移视口中心到对应世界点 */
        const canvas = canvasRef.current;
        if (!canvas || geo.nodes.length === 0) return;
        const rect = canvas.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const py = ((e.clientY - rect.top) / rect.height) * H;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const r of [...geo.nodes, geo.viewport]) {
          minX = Math.min(minX, r.x);
          minY = Math.min(minY, r.y);
          maxX = Math.max(maxX, r.x + r.w);
          maxY = Math.max(maxY, r.y + r.h);
        }
        const scale = Math.min((W - PAD * 2) / (maxX - minX), (H - PAD * 2) / (maxY - minY));
        const ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
        const oy = (H - (maxY - minY) * scale) / 2 - minY * scale;
        const world = { x: (px - ox) / scale, y: (py - oy) / scale };
        const cam = editor.getCamera();
        editor.setCamera(
          { x: world.x - geo.viewport.w / 2, y: world.y - geo.viewport.h / 2, z: cam.z },
          { animation: { duration: 220 } },
        );
      }}
    />
  );
}
