import {
  buildQueryContext,
  ensureIsArray,
  QueryFormColumn,
  SqlaFormData,
} from '@superset-ui/core';
import { RankFlowFormData } from '../types';

function normalizeRowLimit(
  rowLimit: string | number | null | undefined,
): number | undefined {
  if (rowLimit === null || rowLimit === undefined || rowLimit === '') {
    return undefined;
  }

  const parsed = Number(rowLimit);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function buildQuery(formData: SqlaFormData) {
  const fd = formData as RankFlowFormData;

  const columns: QueryFormColumn[] = [
    fd.stageColumn,
    ...ensureIsArray(fd.flowColumns),
  ].filter(Boolean);

  return buildQueryContext(formData, {
    buildQuery: baseQueryObject => [
      {
        ...baseQueryObject,
        columns,
        metrics: [fd.metric],
        row_limit: normalizeRowLimit(fd.row_limit),
      },
    ],
  });
}