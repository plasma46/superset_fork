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
import { DataRecord } from '@superset-ui/core';
import {
  CommentConfig,
  CommentDirtyState,
  CommentFieldConfig,
  CommentSaveRecord,
} from '../types';

export const COMMENT_SELECT_COL_ID = '__comment_select__';
export const COMMENT_ACTION_COL_ID = '__comment_actions__';
export const COMMENT_FIELD_PREFIX = '__comment_field__';

export function isCommentsEnabled(config?: CommentConfig): boolean {
  return Boolean(
    config?.enabled &&
      Array.isArray(config.key_mapping) &&
      config.key_mapping.length > 0 &&
      Array.isArray(config.fields) &&
      config.fields.length > 0,
  );
}

export function getCommentFieldColId(field: CommentFieldConfig): string {
  return `${COMMENT_FIELD_PREFIX}${field.target_column || field.view_column}`;
}

export function isNumericInput(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  return /^-?\d*(\.\d*)?$/.test(String(value));
}

export function coerceCommentValue(
  value: unknown,
  field: CommentFieldConfig,
): unknown {
  if (field.type !== 'number' || value === '' || value == null) {
    return value;
  }
  return Number(value);
}

export function getRowKeys(
  row: DataRecord,
  config?: CommentConfig,
): Record<string, unknown> {
  return Object.fromEntries(
    (config?.key_mapping || [])
      .filter(mapping => mapping.view_column && mapping.target_column)
      .map(mapping => [mapping.target_column, row[mapping.view_column]]),
  );
}

export function getRowKey(row: DataRecord, config?: CommentConfig): string {
  return JSON.stringify(getRowKeys(row, config));
}

export function applyMassInput(
  dirtyState: CommentDirtyState,
  rows: DataRecord[],
  config: CommentConfig,
  field: CommentFieldConfig,
  value: unknown,
): CommentDirtyState {
  return rows.reduce<CommentDirtyState>((nextState, row) => {
    const rowKey = getRowKey(row, config);
    return {
      ...nextState,
      [rowKey]: {
        ...(nextState[rowKey] || {}),
        [field.target_column]: coerceCommentValue(value, field),
      },
    };
  }, dirtyState);
}

export function buildCommentPayload(
  dirtyState: CommentDirtyState,
  rows: DataRecord[],
  config: CommentConfig,
): { records: CommentSaveRecord[] } {
  const rowByKey = new Map(rows.map(row => [getRowKey(row, config), row]));
  return {
    records: Object.entries(dirtyState)
      .filter(([, fields]) => Object.keys(fields).length > 0)
      .map(([rowKey, fields]) => {
        const row = rowByKey.get(rowKey);
        const parsedKeys = JSON.parse(rowKey);
        return {
          keys: row ? getRowKeys(row, config) : parsedKeys,
          fields,
          is_delete: false,
        };
      }),
  };
}

export function buildDeletePayload(
  row: DataRecord,
  config: CommentConfig,
): { records: CommentSaveRecord[] } {
  return {
    records: [
      {
        keys: getRowKeys(row, config),
        fields: {},
        is_delete: true,
      },
    ],
  };
}
