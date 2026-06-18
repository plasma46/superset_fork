import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { RankFlowNode, RankFlowTransformedProps } from './types';

type PositionedNode = RankFlowNode & {
  x: number;
  y: number;
};

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  stage: string;
  value: string;
};

const SVG_TOP_GAP = 8;

const Root = styled.div`
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
  background: ${({ theme }) => theme.colorBgContainer};
  box-sizing: border-box;
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colorBorder};
  border-radius: 8px;
  background: ${({ theme }) => theme.colorBgLayout};
  font-size: 12px;
  box-sizing: border-box;
`;

const SvgWrapper = styled.div`
  padding-top: ${SVG_TOP_GAP}px;
  box-sizing: border-box;
`;

const LegendItem = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: ${({ theme }) => theme.colorText};
`;

const LegendSwatch = styled.span<{ color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: ${({ color }) => color};
  display: inline-block;
`;

const Tooltip = styled.div`
  position: absolute;
  transform: translate(-50%, -110%);
  background: rgba(31, 41, 55, 0.96);
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  z-index: 9999;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
`;

const TooltipTitle = styled.div`
  font-weight: 700;
  margin-bottom: 2px;
`;

function buildPath(
  source: { x: number; y: number },
  target: { x: number; y: number },
  nodeWidth: number,
  nodeHeight: number,
) {
  const sx = source.x + nodeWidth;
  const sy = source.y + nodeHeight / 2;
  const tx = target.x;
  const ty = target.y + nodeHeight / 2;
  const dx = tx - sx;

  return [
    `M ${sx} ${sy}`,
    `C ${sx + dx * 0.45} ${sy},`,
    `${tx - dx * 0.45} ${ty},`,
    `${tx} ${ty}`,
  ].join(' ');
}

function getSvgRelativeMousePosition(event: React.MouseEvent<SVGElement>) {
  const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
  const bounds = svg.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

export default function RankFlow(props: RankFlowTransformedProps) {
  const {
    width,
    height,
    nodes,
    links,
    stages,
    legend,
    nodeWidth,
    nodeHeight,
    rowGap,
    minColumnGap,
    showLegend,
    metricLabel,
    zoom,
  } = props;

  const legendRef = useRef<HTMLDivElement | null>(null);

  const [legendHeight, setLegendHeight] = useState(0);
  const [hoveredFlow, setHoveredFlow] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!showLegend || !legendRef.current) {
      setLegendHeight(0);
      return undefined;
    }

    const updateLegendHeight = () => {
      setLegendHeight(legendRef.current?.getBoundingClientRect().height ?? 0);
    };

    updateLegendHeight();

    const observer = new ResizeObserver(updateLegendHeight);
    observer.observe(legendRef.current);

    return () => observer.disconnect();
  }, [showLegend, legend.length, width]);

  const layout = useMemo(() => {
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

    const paddingX = 8 * safeZoom;
    const headerHeight = 30 * safeZoom;
    const plotTop = 0;

    const scaledNodeWidth = nodeWidth * safeZoom;
    const scaledNodeHeight = nodeHeight * safeZoom;
    const scaledRowGap = rowGap * safeZoom;

    const maxRank =
      nodes.length === 0 ? 0 : Math.max(...nodes.map(node => node.rank));

    const designWidth = 900;

    const adaptiveBaseGap =
      stages.length > 1
        ? Math.max(0, designWidth - paddingX * 2 - scaledNodeWidth) /
          (stages.length - 1)
        : 0;

    const gapRatio = minColumnGap / 200;

    const columnGap =
      stages.length > 1
        ? adaptiveBaseGap * gapRatio
        : 0;

    const contentWidth =
      paddingX * 2 +
      scaledNodeWidth +
      Math.max(0, stages.length - 1) * columnGap;

    const naturalContentHeight =
      plotTop +
      headerHeight +
      scaledNodeHeight +
      maxRank * scaledRowGap +
      16 * safeZoom;

    const availableSvgHeight = Math.max(
      0,
      height - legendHeight - (showLegend ? SVG_TOP_GAP : 0),
    );

    const contentHeight = Math.max(
      availableSvgHeight,
      naturalContentHeight,
    );

    const positionedNodes = new Map<string, PositionedNode>();

    nodes.forEach(node => {
      positionedNodes.set(node.id, {
        ...node,
        x: paddingX + node.step * columnGap,
        y: plotTop + headerHeight + node.rank * scaledRowGap,
      });
    });

    const positionedStages = stages.map(stage => ({
      ...stage,
      x: paddingX + stage.index * columnGap + scaledNodeWidth / 2,
      y: plotTop + 18 * safeZoom,
    }));

    return {
      contentWidth,
      contentHeight,
      positionedNodes,
      positionedStages,
      scaledNodeHeight,
      scaledNodeWidth,
      safeZoom,
    };
  }, [
    width,
    height,
    nodes,
    stages,
    nodeWidth,
    nodeHeight,
    rowGap,
    minColumnGap,
    legendHeight,
    showLegend,
    zoom,
  ]);

  return (
    <Root style={{ width, height }}>
      {showLegend && (
        <Legend ref={legendRef}>
          {legend.map(item => {
            const active =
              hoveredFlow === null || hoveredFlow === item.flow;

            return (
              <LegendItem
                key={item.flow}
                type="button"
                onMouseEnter={() => setHoveredFlow(item.flow)}
                onMouseLeave={() => setHoveredFlow(null)}
                style={{ opacity: active ? 1 : 0.35 }}
              >
                <LegendSwatch color={item.color} />
                <span>{item.flowName}</span>
              </LegendItem>
            );
          })}
        </Legend>
      )}

      <SvgWrapper>
        <svg
          width="100%"
          height={layout.contentHeight}
          viewBox={`0 0 ${layout.contentWidth} ${layout.contentHeight}`}
          role="img"
          preserveAspectRatio="xMidYMin meet"
          style={{ display: 'block' }}
        >
          {layout.positionedStages.map(stage => (
            <text
              key={stage.index}
              x={stage.x}
              y={stage.y}
              textAnchor="middle"
              fontSize={13 * layout.safeZoom}
              fontWeight={600}
              fill="#6B7280"
            >
              {stage.label}
            </text>
          ))}

          {links.map(link => {
            const source = layout.positionedNodes.get(link.sourceId);
            const target = layout.positionedNodes.get(link.targetId);

            if (!source || !target) return null;

            const active =
              hoveredFlow === null || hoveredFlow === link.flow;

            return (
              <path
                key={link.id}
                d={buildPath(
                  source,
                  target,
                  layout.scaledNodeWidth,
                  layout.scaledNodeHeight,
                )}
                fill="none"
                stroke={link.color}
                strokeWidth={
                  active
                    ? 18 * layout.safeZoom
                    : 14 * layout.safeZoom
                }
                strokeLinecap="round"
                opacity={active ? 0.45 : 0.08}
                onMouseEnter={() => setHoveredFlow(link.flow)}
                onMouseLeave={() => {
                  setHoveredFlow(null);
                  setTooltip(null);
                }}
                style={{
                  transition:
                    'opacity 180ms ease, stroke-width 180ms ease',
                }}
              />
            );
          })}

          {Array.from(layout.positionedNodes.values()).map(node => {
            const active =
              hoveredFlow === null || hoveredFlow === node.flow;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => setHoveredFlow(node.flow)}
                onMouseMove={event => {
                  const position =
                    getSvgRelativeMousePosition(event);

                  setTooltip({
                    visible: true,
                    x: position.x,
                    y:
                      position.y +
                      legendHeight +
                      (showLegend ? SVG_TOP_GAP : 0),
                    title: node.flowName,
                    stage: node.stageLabel,
                    value: `${metricLabel}: ${node.valueFormatted}`,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredFlow(null);
                  setTooltip(null);
                }}
                style={{
                  cursor: 'pointer',
                  opacity: active ? 1 : 0.35,
                  transition:
                    'opacity 180ms ease, transform 180ms ease',
                }}
              >
                <rect
                  width={layout.scaledNodeWidth}
                  height={layout.scaledNodeHeight}
                  rx={8 * layout.safeZoom}
                  fill={node.color}
                />

                <text
                  x={layout.scaledNodeWidth / 2}
                  y={
                    layout.scaledNodeHeight / 2 +
                    5 * layout.safeZoom
                  }
                  textAnchor="middle"
                  fontSize={14 * layout.safeZoom}
                  fontWeight={700}
                  fill="#fff"
                  pointerEvents="none"
                >
                  {node.valueFormatted}
                </text>
              </g>
            );
          })}
        </svg>
      </SvgWrapper>

      {tooltip?.visible && (
        <Tooltip
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <TooltipTitle>{tooltip.title}</TooltipTitle>
          <div>{tooltip.stage}</div>
          <div>{tooltip.value}</div>
        </Tooltip>
      )}
    </Root>
  );
}