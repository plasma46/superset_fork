import {
  ChartProps,
  CategoricalColorNamespace,
  DataRecord,
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  getNumberFormatter,
} from '@superset-ui/core';
import { timeFormat } from 'd3-time-format';
import { RankFlowFormData, RankFlowLink, RankFlowNode } from '../types';

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNullish(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Нет значения';
  }

  return String(value);
}

function makeFlowKey(parts: string[]): string {
  // Не используем parts.join('-'), потому что значения могут содержать дефис.
  return JSON.stringify(parts);
}

function parseStageSortValue(value: unknown): number | string {
  const parsed = Date.parse(String(value));

  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  return String(value);
}

function compareStage(a: unknown, b: unknown): number {
  const av = parseStageSortValue(a);
  const bv = parseStageSortValue(b);

  if (typeof av === 'number' && typeof bv === 'number') {
    return av - bv;
  }

  return String(av).localeCompare(String(bv));
}

function formatStageLabel(value: unknown, pattern: string): string {
  const parsed = Date.parse(String(value));

  if (!Number.isNaN(parsed)) {
    return timeFormat(pattern)(new Date(parsed));
  }

  return String(value);
}

export default function transformProps(chartProps: ChartProps) {
  const {
    width,
    height,
    formData,
    queriesData,
  } = chartProps;

  const fd = formData as RankFlowFormData;

  const {
    stageColumn,
    flowColumns,
    metric,
    colorScheme,
    valueFormat = '~s',
    dateFormat = '%d/%m/%y',
    sortDirection = 'desc',
    labelSeparator = ' · ',
    colorBy = 'first_group_column',
    sliceId,
    maxRows,
  } = fd;

  const data = (queriesData?.[0]?.data || []) as DataRecord[];

  const normalizedMaxRows =
    maxRows === null || maxRows === undefined || maxRows === ''
      ? undefined
      : Number(maxRows);

  const maxRowsLimit =
    normalizedMaxRows !== undefined &&
    Number.isFinite(normalizedMaxRows) &&
    normalizedMaxRows > 0
      ? normalizedMaxRows
      : undefined;

  const stageLabel = getColumnLabel(stageColumn);
  const flowLabels = ensureIsArray(flowColumns).map(getColumnLabel);
  const metricLabel = getMetricLabel(metric);
  const valueFormatter = getNumberFormatter(valueFormat);
  const colorScale = CategoricalColorNamespace.getScale(colorScheme as string);

  type NormalizedRow = {
    stageRaw: unknown;
    stageLabel: string;
    flowKey: string;
    flowName: string;
    colorKey: string;
    value: number;
    groupValues: Record<string, string>;
  };

  const aggregated = new Map<string, NormalizedRow>();

  data.forEach(row => {
    const stageRaw = row[stageLabel];
    const parts = flowLabels.map(label => formatNullish(row[label]));
    const flowKey = makeFlowKey(parts);
    const rowKey = JSON.stringify([stageRaw, flowKey]);

    const groupValues = Object.fromEntries(
      flowLabels.map((label, index) => [label, parts[index]]),
    );

    const colorKey =
      colorBy === 'first_group_column'
        ? parts[0]
        : parts.join(labelSeparator);

    const existing = aggregated.get(rowKey);

    if (existing) {
      existing.value += asNumber(row[metricLabel]);
    } else {
      aggregated.set(rowKey, {
        stageRaw,
        stageLabel: formatStageLabel(stageRaw, dateFormat),
        flowKey,
        flowName: parts.join(labelSeparator),
        colorKey,
        value: asNumber(row[metricLabel]),
        groupValues,
      });
    }
  });

  const rows = Array.from(aggregated.values());

  const stageValues = Array.from(
    new Set(rows.map(row => row.stageRaw)),
  ).sort(compareStage);

  const stages = stageValues.map((rawValue, index) => ({
    index,
    rawValue,
    label: formatStageLabel(rawValue, dateFormat),
  }));

  const nodes: RankFlowNode[] = [];
  const nodeByFlowAndStep = new Map<string, RankFlowNode>();

  stages.forEach(stage => {
    let rowsForStage = rows
      .filter(row => row.stageRaw === stage.rawValue)
      .sort((a, b) => {
        return sortDirection === 'desc'
          ? b.value - a.value
          : a.value - b.value;
      });

    if (maxRowsLimit !== undefined) {
      rowsForStage = rowsForStage.slice(0, maxRowsLimit);
    }

    rowsForStage.forEach((row, rank) => {
      const step = stage.index;

      const node: RankFlowNode = {
        id: `${row.flowKey}:${step}`,
        flow: row.flowKey,
        flowName: row.flowName,
        groupValues: row.groupValues,
        step,
        rank,
        stageLabel: stage.label,
        value: row.value,
        valueFormatted: valueFormatter(row.value),
        color: colorScale(row.colorKey, sliceId),
      };

      nodes.push(node);
      nodeByFlowAndStep.set(`${row.flowKey}:${step}`, node);
    });
  });

  const flowKeys = Array.from(new Set(rows.map(row => row.flowKey)));

  const links: RankFlowLink[] = [];

  flowKeys.forEach(flowKey => {
    for (let step = 0; step < stages.length - 1; step += 1) {
      const source = nodeByFlowAndStep.get(`${flowKey}:${step}`);
      const target = nodeByFlowAndStep.get(`${flowKey}:${step + 1}`);

      if (source && target) {
        links.push({
          id: `${flowKey}:${step}:${step + 1}`,
          flow: flowKey,
          flowName: source.flowName,
          sourceId: source.id,
          targetId: target.id,
          color: source.color,
        });
      }
    }
  });

  const legend = Array.from(
    new Map(
      nodes.map(node => [
        node.flow,
        {
          flow: node.flow,
          flowName: node.flowName,
          color: node.color,
        },
      ]),
    ).values(),
  );

  return {
    width,
    height,

    nodes,
    links,
    stages,
    legend,

    nodeWidth: fd.nodeWidth ?? 120,
    nodeHeight: fd.nodeHeight ?? 52,
    rowGap: fd.rowGap ?? 72,
    minColumnGap: fd.minColumnGap ?? 200,
    showLegend: fd.showLegend ?? true,
    zoom: fd.zoom ?? 1,
    metricLabel,
  };
}