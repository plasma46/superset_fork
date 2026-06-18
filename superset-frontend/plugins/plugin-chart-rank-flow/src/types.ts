// src/types.ts

import {
  QueryFormColumn,
  QueryFormData,
  QueryFormMetric,
} from '@superset-ui/core';

export type RankFlowFormData = QueryFormData & {
  stageColumn: QueryFormColumn;
  flowColumns: QueryFormColumn[];
  metric: QueryFormMetric;

  colorScheme?: string;
  dateFormat?: string;
  valueFormat?: string;
  sortDirection?: 'asc' | 'desc';

  nodeWidth?: number;
  nodeHeight?: number;
  rowGap?: number;
  minColumnGap?: number;
  zoom?: number;
  maxRows?: number | string | null;

  showLegend?: boolean;
  labelSeparator?: string;
  colorBy?: 'first_group_column' | 'full_flow';
};

export type RankFlowNode = {
  id: string;
  flow: string;
  flowName: string;
  groupValues: Record<string, string>;
  step: number;
  rank: number;
  stageLabel: string;
  value: number;
  valueFormatted: string;
  color: string;
};

export type RankFlowLink = {
  id: string;
  flow: string;
  flowName: string;
  sourceId: string;
  targetId: string;
  color: string;
};

export type RankFlowStage = {
  index: number;
  rawValue: unknown;
  label: string;
};

export type RankFlowLegendItem = {
  flow: string;
  flowName: string;
  color: string;
};

export type RankFlowTransformedProps = {
  width: number;
  height: number;

  nodes: RankFlowNode[];
  links: RankFlowLink[];
  stages: RankFlowStage[];
  legend: RankFlowLegendItem[];

  nodeWidth: number;
  nodeHeight: number;
  rowGap: number;
  minColumnGap: number;

  maxRows: number | string | null;
  showLegend: boolean;
  zoom: number;
  metricLabel: string;
};