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
import { ICellRendererParams } from '@superset-ui/core/components/ThemedAgGridReact';
import { DataRecord } from '@superset-ui/core';
import {
  CommentDirtyState,
  CommentFieldConfig,
  CommentOption,
  CellRendererProps,
} from '../types';
import { isNumericInput } from '../utils/commentEditing';

interface EditableCommentCellRendererProps extends ICellRendererParams {
  baseRenderer?: (params: CellRendererProps) => JSX.Element | null;
  editableField: CommentFieldConfig;
  dirtyState?: CommentDirtyState;
  invalidCells?: Record<string, boolean>;
  dynamicOptions?: Record<string, CommentOption[]>;
  updateCommentValue?: (
    rowIndex: number,
    field: CommentFieldConfig,
    value: unknown,
    invalid?: boolean,
  ) => void;
}

const getOptionValue = (
  options: CommentOption[],
  selectedValue: string,
): unknown =>
  options.find(option => String(option.value) === selectedValue)?.value ??
  selectedValue;

export const EditableCommentCellRenderer = (
  params: EditableCommentCellRendererProps,
) => {
  const {
    node,
    data,
    rowIndex,
    baseRenderer,
    editableField,
    dirtyState,
    invalidCells,
    dynamicOptions,
    updateCommentValue,
  } = params;

  if (!data || node?.rowPinned || !updateCommentValue) {
    if (baseRenderer) {
      return baseRenderer(params as CellRendererProps);
    }
    return null;
  }

  const row = data as DataRecord;
  const dirtyValue = dirtyState?.[rowIndex]?.[editableField.target_column];
  const value = dirtyValue ?? row[editableField.view_column] ?? '';
  const invalidKey = `${rowIndex}:${editableField.target_column}`;
  const hasError = Boolean(invalidCells?.[invalidKey]);

  const commonStyle = {
    width: '100%',
    minHeight: 24,
    border: hasError ? '1px solid #d93025' : '1px solid #d9d9d9',
    borderRadius: 4,
    padding: '0 6px',
  };

  if (
    editableField.type === 'dropdown_static' ||
    editableField.type === 'dropdown_dynamic'
  ) {
    const options =
      editableField.type === 'dropdown_static'
        ? editableField.options || []
        : dynamicOptions?.[editableField.target_column] || [];

    return (
      <select
        aria-label={editableField.view_column}
        style={commonStyle}
        value={String(value ?? '')}
        onChange={event =>
          updateCommentValue(
            rowIndex,
            editableField,
            getOptionValue(options, event.currentTarget.value),
          )
        }
      >
        <option value="" />
        {options.map(option => (
          <option
            key={String(option.value)}
            value={String(option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (editableField.type === 'number') {
    return (
      <input
        aria-label={editableField.view_column}
        style={commonStyle}
        type="number"
        value={String(value ?? '')}
        onKeyPress={event => {
          if (!/[\d.-]/.test(event.key)) event.preventDefault();
        }}
        onChange={event => {
          const nextValue = event.currentTarget.value;
          updateCommentValue(
            rowIndex,
            editableField,
            nextValue,
            !isNumericInput(nextValue),
          );
        }}
      />
    );
  }

  return (
    <textarea
      aria-label={editableField.view_column}
      rows={1}
      style={{
        ...commonStyle,
        resize: 'none',
        overflow: 'hidden',
        lineHeight: '1.4',
        boxSizing: 'border-box',
      }}
      value={String(value ?? '')}
      onChange={event => {
        const el = event.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
        updateCommentValue(rowIndex, editableField, el.value);
      }}
    />
  );
};
