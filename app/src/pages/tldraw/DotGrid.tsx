/**
 * DotGrid — 画布点阵背景（design.md §2.1），tldraw `components.Grid` 覆写
 *
 * 点径 1.5px（r=0.75）、间距 24px（页面单位）、颜色 --canvas-grid；
 * zoom < 0.4 时淡出（密集点阵在缩略态产生摩尔纹）。
 */
import { useId } from 'react';
import type { TLGridProps } from 'tldraw';

export function DotGrid({ x, y, z }: TLGridProps) {
  const id = `dot-grid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  /* 间距 24px 页面单位 → 屏幕 px；过密时翻倍防摩尔纹 */
  let step = 24 * z;
  while (step < 14) step *= 2;
  const opacity = z < 0.4 ? Math.max(0, (z - 0.2) / 0.2) : 1;
  if (opacity <= 0) return null;

  /* 与 tldraw DefaultGrid 同款偏移算法：点圆心放在 tile 内的偏移位置 */
  const xo = 0.5 + x * z;
  const yo = 0.5 + y * z;
  const gxo = xo > 0 ? xo % step : step + (xo % step);
  const gyo = yo > 0 ? yo % step : step + (yo % step);

  return (
    <svg className="tl-grid" version="1.1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ opacity }}>
      <defs>
        <pattern id={id} width={step} height={step} patternUnits="userSpaceOnUse">
          <circle cx={gxo} cy={gyo} r={0.75} fill="var(--canvas-grid)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
