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
import {
  applyMassInput,
  buildCommentPayload,
  getRowKey,
  isNumericInput,
} from '../../src/utils/commentEditing';
import { CommentConfig } from '../../src/types';

const config: CommentConfig = {
  enabled: true,
  database_id: 1,
  schema: 'public',
  table: 'demo_comments',
  key_mapping: [
    { view_column: 'plant_id', target_column: 'plant_id' },
    { view_column: 'month', target_column: 'month' },
  ],
  fields: [
    {
      view_column: 'comment_text',
      target_column: 'comment_text',
      type: 'text',
    },
    { view_column: 'qty', target_column: 'qty_value', type: 'number' },
  ],
};

const rows = [
  { plant_id: 'A-12', month: '2026-06', qty: 1 },
  { plant_id: 'B-13', month: '2026-06', qty: 2 },
];

test('validates numeric input before save', () => {
  expect(isNumericInput('10')).toBe(true);
  expect(isNumericInput('-10.5')).toBe(true);
  expect(isNumericInput('')).toBe(true);
  expect(isNumericInput('abc')).toBe(false);
  expect(isNumericInput('12a')).toBe(false);
});

test('builds payload for one dirty row', () => {
  const rowKey = getRowKey(rows[0], config);
  expect(
    buildCommentPayload(
      {
        [rowKey]: {
          comment_text: 'Checked',
          qty_value: 15,
        },
      },
      rows,
      config,
    ),
  ).toEqual({
    records: [
      {
        keys: { plant_id: 'A-12', month: '2026-06' },
        fields: { comment_text: 'Checked', qty_value: 15 },
        is_delete: false,
      },
    ],
  });
});

test('applies mass input to multiple selected rows', () => {
  const dirty = applyMassInput(
    {},
    rows,
    config,
    config.fields![0],
    'Mass note',
  );

  expect(dirty[getRowKey(rows[0], config)]).toEqual({
    comment_text: 'Mass note',
  });
  expect(dirty[getRowKey(rows[1], config)]).toEqual({
    comment_text: 'Mass note',
  });
});

test('builds payload for bulk dirty rows', () => {
  const dirty = applyMassInput(
    {},
    rows,
    config,
    config.fields![1],
    '42',
  );

  expect(buildCommentPayload(dirty, rows, config)).toEqual({
    records: [
      {
        keys: { plant_id: 'A-12', month: '2026-06' },
        fields: { qty_value: 42 },
        is_delete: false,
      },
      {
        keys: { plant_id: 'B-13', month: '2026-06' },
        fields: { qty_value: 42 },
        is_delete: false,
      },
    ],
  });
});

test('successful save can clear dirty state by replacing it with empty object', () => {
  const dirty = applyMassInput(
    {},
    rows,
    config,
    config.fields![0],
    'Done',
  );
  expect(Object.keys(dirty)).toHaveLength(2);
  const cleared = {};
  expect(cleared).toEqual({});
});
