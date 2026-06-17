/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { t } from '@apache-superset/core/translation';
import {
  DataRecord,
  DataRecordValue,
  getTimeFormatterForGranularity,
  SupersetClient,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { isEqual } from 'lodash';
import { useDispatch, useSelector } from 'react-redux';

import {
  CellClickedEvent,
  ColDef,
  ICellRendererParams,
  SelectionChangedEvent,
} from '@superset-ui/core/components/ThemedAgGridReact';
import {
  addDangerToast,
  addSuccessToast,
} from 'src/components/MessageToasts/actions';
import { refreshChart } from 'src/components/Chart/chartAction';
import {
  AgGridTableChartTransformedProps,
  CommentConfig,
  CommentDirtyState,
  CommentFieldConfig,
  CommentOption,
  InputColumn,
  SearchOption,
  SortByItem,
} from './types';
import AgGridDataTable from './AgGridTable';
import { updateTableOwnState } from './utils/externalAPIs';
import TimeComparisonVisibility from './AgGridTable/components/TimeComparisonVisibility';
import { useColDefs } from './utils/useColDefs';
import { buildSelectionCrossFilterDataMask } from './utils/getCrossFilterDataMask';
import { StyledChartContainer } from './styles';
import type { FilterState } from './utils/filterStateManager';
import {
  applyMassInput,
  buildCommentPayload,
  buildDeletePayload,
  COMMENT_ACTION_COL_ID,
  COMMENT_SELECT_COL_ID,
  getCommentFieldColId,
  isCommentsEnabled,
  isNumericInput,
} from './utils/commentEditing';

const getGridHeight = (height: number, includeSearch: boolean | undefined) => {
  let calculatedGridHeight = height;
  if (includeSearch) {
    calculatedGridHeight -= 16;
  }
  return calculatedGridHeight - 80;
};

const normalizeCommentConfig = (
  config?: CommentConfig | string,
): CommentConfig | undefined => {
  if (!config) {
    return undefined;
  }
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return undefined;
    }
  }
  return config;
};

const getDynamicOptions = async (
  field: CommentFieldConfig,
): Promise<CommentOption[]> => {
  if (!field.dataset_id || !field.value_column || !field.label_column) {
    return [];
  }
  const { json } = await SupersetClient.get({
    endpoint: `/api/v1/dataset/${field.dataset_id}/data/`,
  });
  const rows =
    json?.result?.data ||
    json?.result?.records ||
    json?.data ||
    json?.records ||
    [];
  return Array.isArray(rows)
    ? rows.map((row: Record<string, unknown>) => ({
        value: row[field.value_column!],
        label: String(
          row[field.label_column!] ?? row[field.value_column!] ?? '',
        ),
      }))
    : [];
};

const getOptionValue = (
  options: CommentOption[],
  selectedValue: string,
): unknown =>
  options.find(option => String(option.value) === selectedValue)?.value ??
  selectedValue;

export default function TableChart<D extends DataRecord = DataRecord>(
  props: AgGridTableChartTransformedProps<D> & {},
) {
  const {
    height,
    columns,
    data,
    includeSearch,
    allowRearrangeColumns,
    pageSize,
    serverPagination,
    rowCount,
    setDataMask,
    serverPaginationData,
    slice_id,
    percentMetrics,
    hasServerPageLengthChanged,
    serverPageLength,
    emitCrossFilters,
    filters,
    timeGrain,
    isRawRecords,
    alignPositiveNegative,
    showCellBars,
    isUsingTimeComparison,
    colorPositiveNegative,
    totals,
    showTotals,
    columnColorFormatters,
    basicColorFormatters,
    width,
    onChartStateChange,
    chartState,
    metricSqlExpressions,
    commentConfig: rawCommentConfig,
  } = props;

  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);
  const dispatch = useDispatch();
  const dashboardId = useSelector(
    (state: { dashboardInfo?: { id?: number } }) => state.dashboardInfo?.id,
  );
  const commentConfig = useMemo(
    () => normalizeCommentConfig(rawCommentConfig),
    [rawCommentConfig],
  );
  const commentsEnabled = isCommentsEnabled(commentConfig);
  const [selectedRows, setSelectedRows] = useState<DataRecord[]>([]);
  const [dirtyState, setDirtyState] = useState<CommentDirtyState>({});
  const [invalidCells, setInvalidCells] = useState<Record<string, boolean>>({});
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, CommentOption[]>
  >({});
  const [isSavingComments, setIsSavingComments] = useState(false);
  const [massInputOpen, setMassInputOpen] = useState(false);
  const [massInputField, setMassInputField] = useState('');
  const [massInputValue, setMassInputValue] = useState('');

  // Extract metric column names for SQL conversion
  const metricColumns = useMemo(
    () =>
      columns
        .filter(col => col.isMetric || col.isPercentMetric)
        .map(col => col.key),
    [columns],
  );

  useEffect(() => {
    const options = columns
      .filter(col => col?.dataType === GenericDataType.String)
      .map(column => ({
        value: column.key,
        label: column.label,
      }));

    if (!isEqual(options, searchOptions)) {
      setSearchOptions(options || []);
    }
  }, [columns]);

  useEffect(() => {
    if (!commentsEnabled || !commentConfig?.fields) {
      return;
    }
    commentConfig.fields
      .filter(field => field.type === 'dropdown_dynamic')
      .forEach(field => {
        const fieldKey = field.target_column;
        if (dynamicOptions[fieldKey]) {
          return;
        }
        getDynamicOptions(field)
          .then(options =>
            setDynamicOptions(current => ({
              ...current,
              [fieldKey]: options,
            })),
          )
          .catch(() =>
            dispatch(
              addDangerToast(
                t('Failed to load dynamic options for %s', field.view_column),
              ),
            ),
          );
      });
  }, [commentsEnabled, commentConfig?.fields, dispatch, dynamicOptions]);

  useEffect(() => {
    if (!serverPagination || !serverPaginationData || !rowCount) return;

    const currentPage = serverPaginationData.currentPage ?? 0;
    const currentPageSize = serverPaginationData.pageSize ?? serverPageLength;
    const totalPages = Math.ceil(rowCount / currentPageSize);

    if (currentPage >= totalPages && totalPages > 0) {
      const validPage = Math.max(0, totalPages - 1);
      const modifiedOwnState = {
        ...serverPaginationData,
        currentPage: validPage,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    }
  }, [
    rowCount,
    serverPagination,
    serverPaginationData,
    serverPageLength,
    setDataMask,
  ]);

  const comparisonColumns = [
    { key: 'all', label: t('Display all') },
    { key: '#', label: '#' },
    { key: '△', label: '△' },
    { key: '%', label: '%' },
  ];

  const [selectedComparisonColumns, setSelectedComparisonColumns] = useState([
    comparisonColumns?.[0]?.key,
  ]);

  const handleColumnStateChange = useCallback(
    agGridState => {
      if (onChartStateChange) {
        onChartStateChange(agGridState);
      }
    },
    [onChartStateChange],
  );

  const handleFilterChanged = useCallback(
    (completeFilterState: FilterState) => {
      if (!serverPagination) return;
      // Sync chartState immediately with the new filter model to prevent stale state
      // This ensures chartState and ownState are in sync
      if (onChartStateChange && chartState) {
        const filterModel =
          completeFilterState.originalFilterModel &&
          Object.keys(completeFilterState.originalFilterModel).length > 0
            ? completeFilterState.originalFilterModel
            : undefined;
        const updatedChartState = {
          ...chartState,
          filterModel,
          timestamp: Date.now(),
        };
        onChartStateChange(updatedChartState);
      }

      // Prepare modified own state for server pagination
      const modifiedOwnState = {
        ...serverPaginationData,
        agGridFilterModel:
          completeFilterState.originalFilterModel &&
          Object.keys(completeFilterState.originalFilterModel).length > 0
            ? completeFilterState.originalFilterModel
            : undefined,
        agGridSimpleFilters: completeFilterState.simpleFilters,
        agGridComplexWhere: completeFilterState.complexWhere,
        agGridHavingClause: completeFilterState.havingClause,
        lastFilteredColumn: completeFilterState.lastFilteredColumn,
        lastFilteredInputPosition: completeFilterState.inputPosition,
        currentPage: 0, // Reset to first page when filtering
        metricSqlExpressions,
      };

      updateTableOwnState(setDataMask, modifiedOwnState);
    },
    [
      setDataMask,
      serverPagination,
      serverPaginationData,
      onChartStateChange,
      chartState,
      metricSqlExpressions,
    ],
  );

  const filteredColumns = useMemo(() => {
    if (!isUsingTimeComparison) {
      return columns;
    }
    if (
      selectedComparisonColumns.length === 0 ||
      selectedComparisonColumns.includes('all')
    ) {
      return columns?.filter(col => col?.config?.visible !== false);
    }

    return columns
      .filter(
        col =>
          !col.originalLabel ||
          (col?.label || '').includes('Main') ||
          selectedComparisonColumns.includes(col.label),
      )
      .filter(col => col?.config?.visible !== false);
  }, [columns, selectedComparisonColumns]);

  const updateCommentValue = useCallback(
    (
      rowIndex: number,
      field: CommentFieldConfig,
      rawValue: unknown,
      invalid = false,
    ) => {
      const invalidKey = `${rowIndex}:${field.target_column}`;
      setInvalidCells(current => ({
        ...current,
        [invalidKey]: invalid,
      }));
      if (invalid) {
        return;
      }
      const value =
        field.type === 'number' && rawValue !== '' && rawValue != null
          ? Number(rawValue)
          : rawValue;
      setDirtyState(current => ({
        ...current,
        [rowIndex]: {
          ...(current[rowIndex] || {}),
          [field.target_column]: value,
        },
      }));
    },
    [],
  );

  const colDefs = useColDefs({
    columns: isUsingTimeComparison
      ? (filteredColumns as InputColumn[])
      : (columns as InputColumn[]),
    data,
    serverPagination,
    isRawRecords,
    defaultAlignPN: alignPositiveNegative,
    showCellBars,
    colorPositiveNegative,
    totals,
    columnColorFormatters,
    allowRearrangeColumns,
    basicColorFormatters,
    isUsingTimeComparison,
    emitCrossFilters,
    alignPositiveNegative,
    slice_id,
    commentConfig,
    dirtyState: commentsEnabled ? dirtyState : undefined,
    invalidCells: commentsEnabled ? invalidCells : undefined,
    dynamicOptions: commentsEnabled ? dynamicOptions : undefined,
    updateCommentValue: commentsEnabled ? updateCommentValue : undefined,
  });

  const handleDeleteComment = useCallback(
    async (row: DataRecord) => {
      if (!commentConfig) {
        return;
      }
      setIsSavingComments(true);
      try {
        await SupersetClient.post({
          endpoint: `/api/v1/chart/${slice_id}/comments`,
          jsonPayload: buildDeletePayload(row, commentConfig),
        });
        dispatch(addSuccessToast(t('Saved')));
        if (commentConfig.refresh_chart_id) {
          (dispatch as any)(
            refreshChart(commentConfig.refresh_chart_id, true, dashboardId),
          );
        }
      } catch (error) {
        dispatch(
          addDangerToast(
            (error as Error)?.message ||
              t('Failed to delete comment. Please try again.'),
          ),
        );
      } finally {
        setIsSavingComments(false);
      }
    },
    [commentConfig, dashboardId, dispatch, slice_id],
  );

  const commentColDefs = useMemo<ColDef[]>(() => {
    if (!commentsEnabled) {
      return colDefs as ColDef[];
    }

    const selectCol: ColDef = {
      colId: COMMENT_SELECT_COL_ID,
      field: COMMENT_SELECT_COL_ID,
      headerName: '',
      checkboxSelection: true,
      headerCheckboxSelection: true,
      width: 48,
      minWidth: 48,
      maxWidth: 56,
      pinned: 'left',
      lockPosition: true,
      sortable: false,
      filter: false,
      resizable: false,
      suppressMenu: true,
    };

    const actionCol: ColDef = {
      colId: COMMENT_ACTION_COL_ID,
      field: COMMENT_ACTION_COL_ID,
      headerName: '',
      width: 92,
      minWidth: 92,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams) =>
        !params.data || params.node?.rowPinned ? null : (
          <button
            type="button"
            onClick={() => handleDeleteComment(params.data as DataRecord)}
          >
            {t('Delete')}
          </button>
        ),
    };

    return [selectCol, ...(colDefs as ColDef[]), actionCol];
  }, [colDefs, handleDeleteComment, commentsEnabled]);

  const gridHeight = getGridHeight(height, includeSearch);

  const isActiveFilterValue = useCallback(
    function isActiveFilterValue(key: string, val: DataRecordValue) {
      if (!filters || !filters[key]) return false;
      return filters[key].some(filterVal => {
        if (filterVal === val) return true;
        if (filterVal instanceof Date && val instanceof Date) {
          return filterVal.getTime() === val.getTime();
        }
        return false;
      });
    },
    [filters],
  );

  const timestampFormatter = useCallback(
    (value: DataRecordValue) =>
      isRawRecords
        ? String(value ?? '')
        : getTimeFormatterForGranularity(timeGrain)(
            value as number | Date | null | undefined,
          ),
    [timeGrain, isRawRecords],
  );

  const activeColumnRef = useRef<string | null>(null);

  const handleCellClicked = useCallback(
    (event: CellClickedEvent) => {
      if (!emitCrossFilters || !event.column) return;
      const clickedColId = event.column.getColId();
      if (
        clickedColId === COMMENT_SELECT_COL_ID ||
        clickedColId === COMMENT_ACTION_COL_ID ||
        clickedColId.startsWith('__comment_field__')
      ) {
        activeColumnRef.current = null;
        return;
      }
      const colDef = event.column.getColDef();
      if (colDef.context?.isMetric || colDef.context?.isPercentMetric) return;

      const key = clickedColId;
      activeColumnRef.current = key;

      // Re-click on already-filtered single selection → untoggle
      // AG Grid doesn't change selection when re-clicking the same row,
      // so onSelectionChanged won't fire — handle clear directly here
      const selectedNodes = event.api.getSelectedNodes();
      if (
        selectedNodes.length === 1 &&
        selectedNodes[0] === event.node &&
        isActiveFilterValue(key, event.value)
      ) {
        event.node.setSelected(false);
        setDataMask(
          buildSelectionCrossFilterDataMask({
            key,
            values: [],
            timeGrain,
            timestampFormatter,
          }).dataMask,
        );
      }
    },
    [
      emitCrossFilters,
      isActiveFilterValue,
      setDataMask,
      timeGrain,
      timestampFormatter,
    ],
  );

  const handleSelectionChanged = useCallback(
    (event: SelectionChangedEvent) => {
      if (!emitCrossFilters || !activeColumnRef.current) return;

      const key = activeColumnRef.current;
      const selectedRows = event.api.getSelectedRows();
      const values = selectedRows
        .map(row => row[key] as DataRecordValue)
        .filter(v => v != null);

      setDataMask(
        buildSelectionCrossFilterDataMask({
          key,
          values,
          timeGrain,
          timestampFormatter,
        }).dataMask,
      );
    },
    [emitCrossFilters, setDataMask, timeGrain, timestampFormatter],
  );

  const hasDirtyRows = Object.values(dirtyState).some(
    fields => Object.keys(fields).length > 0,
  );
  const hasInvalidCells = Object.values(invalidCells).some(Boolean);

  const saveComments = useCallback(async () => {
    if (!commentConfig || !hasDirtyRows || hasInvalidCells) {
      return;
    }
    setIsSavingComments(true);
    try {
      await SupersetClient.post({
        endpoint: `/api/v1/chart/${slice_id}/comments`,
        jsonPayload: buildCommentPayload(dirtyState, data, commentConfig),
      });
      setDirtyState({});
      setInvalidCells({});
      dispatch(addSuccessToast(t('Saved')));
      if (commentConfig.refresh_chart_id) {
        (dispatch as any)(
          refreshChart(commentConfig.refresh_chart_id, true, dashboardId),
        );
      }
    } catch (error) {
      dispatch(
        addDangerToast(
          (error as Error)?.message ||
            t('Failed to save comments. Please try again.'),
        ),
      );
    } finally {
      setIsSavingComments(false);
    }
  }, [
    commentConfig,
    dashboardId,
    data,
    dirtyState,
    dispatch,
    hasDirtyRows,
    hasInvalidCells,
    slice_id,
  ]);

  const applyMassValue = useCallback(() => {
    if (!commentConfig) {
      return;
    }
    const field = (commentConfig.fields || []).find(
      item => item.target_column === massInputField,
    );
    if (!field) {
      return;
    }
    if (field.type === 'number' && !isNumericInput(massInputValue)) {
      dispatch(addDangerToast(t('Value must be numeric')));
      return;
    }
    setDirtyState(current =>
      applyMassInput(current, selectedRows, data, field, massInputValue),
    );
    setMassInputOpen(false);
    setMassInputValue('');
  }, [commentConfig, dispatch, massInputField, massInputValue, selectedRows]);

  const handleServerPaginationChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const modifiedOwnState = {
        ...serverPaginationData,
        currentPage: pageNumber,
        pageSize,
        lastFilteredColumn: undefined,
        lastFilteredInputPosition: undefined,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    },
    [setDataMask],
  );

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      const modifiedOwnState = {
        ...serverPaginationData,
        currentPage: 0,
        pageSize,
        lastFilteredColumn: undefined,
        lastFilteredInputPosition: undefined,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    },
    [setDataMask],
  );

  const handleChangeSearchCol = (searchCol: string) => {
    if (!isEqual(searchCol, serverPaginationData?.searchColumn)) {
      const modifiedOwnState = {
        ...serverPaginationData,
        searchColumn: searchCol,
        searchText: '',
        lastFilteredColumn: undefined,
        lastFilteredInputPosition: undefined,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    }
  };

  const handleSearch = useCallback(
    (searchText: string) => {
      const modifiedOwnState = {
        ...serverPaginationData,
        searchColumn:
          serverPaginationData?.searchColumn || searchOptions[0]?.value,
        searchText,
        currentPage: 0, // Reset to first page when searching
        lastFilteredColumn: undefined,
        lastFilteredInputPosition: undefined,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    },
    [setDataMask, searchOptions],
  );

  const handleSortByChange = useCallback(
    (sortBy: SortByItem[]) => {
      if (!serverPagination) return;
      const modifiedOwnState = {
        ...serverPaginationData,
        sortBy,
        lastFilteredColumn: undefined,
        lastFilteredInputPosition: undefined,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    },
    [setDataMask, serverPagination],
  );

  const renderTimeComparisonVisibility = (): JSX.Element => (
    <TimeComparisonVisibility
      comparisonColumns={comparisonColumns}
      selectedComparisonColumns={selectedComparisonColumns}
      onSelectionChange={setSelectedComparisonColumns}
    />
  );

  return (
    <StyledChartContainer height={height}>
      {commentsEnabled && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          {commentConfig?.bulk_input && selectedRows.length >= 2 && (
            <button type="button" onClick={() => setMassInputOpen(true)}>
              {t('Mass input')}
            </button>
          )}
          <button
            type="button"
            disabled={!hasDirtyRows || hasInvalidCells || isSavingComments}
            onClick={saveComments}
          >
            {isSavingComments ? t('Saving...') : t('Save')}
          </button>
          {hasInvalidCells && (
            <span style={{ color: '#d93025' }}>{t('Fix invalid values')}</span>
          )}
        </div>
      )}
      {commentsEnabled && massInputOpen && (
        <div
          style={{
            position: 'absolute',
            zIndex: 5,
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            padding: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <select
              aria-label={t('Field')}
              value={massInputField}
              onChange={event => setMassInputField(event.currentTarget.value)}
            >
              <option value="" />
              {(commentConfig?.fields || []).map(field => (
                <option key={field.target_column} value={field.target_column}>
                  {field.view_column}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <input
              aria-label={t('Value')}
              value={massInputValue}
              onChange={event => setMassInputValue(event.currentTarget.value)}
            />
          </div>
          <button type="button" onClick={applyMassValue}>
            {t('Apply')}
          </button>
          <button type="button" onClick={() => setMassInputOpen(false)}>
            {t('Cancel')}
          </button>
        </div>
      )}
      <AgGridDataTable
        gridHeight={gridHeight}
        data={data || []}
        colDefsFromProps={commentColDefs}
        includeSearch={!!includeSearch}
        allowRearrangeColumns={!!allowRearrangeColumns}
        pagination={!!pageSize && !serverPagination}
        pageSize={pageSize || 0}
        serverPagination={serverPagination}
        rowCount={rowCount}
        onServerPaginationChange={handleServerPaginationChange}
        onServerPageSizeChange={handlePageSizeChange}
        serverPaginationData={serverPaginationData}
        searchOptions={searchOptions}
        onSearchColChange={handleChangeSearchCol}
        onSearchChange={handleSearch}
        onSortChange={handleSortByChange}
        onFilterChanged={handleFilterChanged}
        metricColumns={metricColumns}
        id={slice_id}
        handleCellClicked={handleCellClicked}
        handleSelectionChanged={handleSelectionChanged}
        onSelectedRowsChange={setSelectedRows}
        filters={filters}
        percentMetrics={percentMetrics}
        serverPageLength={serverPageLength}
        hasServerPageLengthChanged={hasServerPageLengthChanged}
        renderTimeComparisonDropdown={
          isUsingTimeComparison ? renderTimeComparisonVisibility : () => null
        }
        cleanedTotals={totals || {}}
        showTotals={showTotals}
        width={width}
        onColumnStateChange={handleColumnStateChange}
        chartState={chartState}
      />
    </StyledChartContainer>
  );
}
