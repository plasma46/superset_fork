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
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditableCommentCellRenderer } from '../renderers/EditableCommentCellRenderer';
import { CommentFieldConfig } from '../types';

describe('EditableCommentCellRenderer', () => {
  const mockUpdateCommentValue = jest.fn();
  const baseRenderer = jest.fn(() => <div>Base Renderer</div>);
  const rowData = { comment_text: 'Hello', qty: 10, status: 1 };
  const rowIndex = 0;

  const textField: CommentFieldConfig = {
    view_column: 'comment_text',
    target_column: 'comment_text',
    type: 'text',
  };

  const numberField: CommentFieldConfig = {
    view_column: 'qty',
    target_column: 'qty_value',
    type: 'number',
  };

  const dropdownStaticField: CommentFieldConfig = {
    view_column: 'status',
    target_column: 'status_id',
    type: 'dropdown_static',
    options: [
      { label: 'Open', value: 1 },
      { label: 'Closed', value: 2 },
    ],
  };

  const createMockParams = (field: CommentFieldConfig) => ({
    node: { rowPinned: undefined },
    data: rowData,
    rowIndex,
    editableField: field,
    dirtyState: {},
    invalidCells: {},
    dynamicOptions: {},
    updateCommentValue: mockUpdateCommentValue,
    baseRenderer,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders textarea for text field', () => {
    const params = createMockParams(textField);
    render(<EditableCommentCellRenderer {...params} />);

    const textarea = screen.getByDisplayValue('Hello');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('renders input for number field', () => {
    const params = createMockParams(numberField);
    render(<EditableCommentCellRenderer {...params} />);

    const input = screen.getByDisplayValue('10');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'number');
  });

  it('renders select for dropdown_static field', () => {
    const params = createMockParams(dropdownStaticField);
    render(<EditableCommentCellRenderer {...params} />);

    const select = screen.getByDisplayValue('1');
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe('SELECT');
  });

  it('calls updateCommentValue when textarea changes', () => {
    const params = createMockParams(textField);
    render(<EditableCommentCellRenderer {...params} />);

    const textarea = screen.getByDisplayValue('Hello') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Updated' } });

    expect(mockUpdateCommentValue).toHaveBeenCalledWith(
      rowIndex,
      textField,
      'Updated',
    );
  });

  it('calls updateCommentValue when number input changes', () => {
    const params = createMockParams(numberField);
    render(<EditableCommentCellRenderer {...params} />);

    const input = screen.getByDisplayValue('10') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '20' } });

    expect(mockUpdateCommentValue).toHaveBeenCalledWith(
      rowIndex,
      numberField,
      '20',
      false,
    );
  });

  it('calls updateCommentValue when select changes', () => {
    const params = createMockParams(dropdownStaticField);
    render(<EditableCommentCellRenderer {...params} />);

    const select = screen.getByDisplayValue('1') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });

    expect(mockUpdateCommentValue).toHaveBeenCalledWith(
      rowIndex,
      dropdownStaticField,
      2,
    );
  });

  it('renders dirty state value if present', () => {
    const dirtyState = { [rowIndex]: { comment_text: 'Dirty' } };
    const params = createMockParams(textField);
    params.dirtyState = dirtyState;

    render(<EditableCommentCellRenderer {...params} />);

    const textarea = screen.getByDisplayValue('Dirty');
    expect(textarea).toBeInTheDocument();
  });

  it('shows error border when cell is invalid', () => {
    const invalidCells = { [`${rowIndex}:${textField.target_column}`]: true };
    const params = createMockParams(textField);
    params.invalidCells = invalidCells;

    render(<EditableCommentCellRenderer {...params} />);

    const textarea = screen.getByDisplayValue('Hello') as HTMLTextAreaElement;
    expect(textarea).toHaveStyle('border: 1px solid #d93025');
  });

  it('uses baseRenderer for totals row', () => {
    const params = createMockParams(textField);
    params.node = { rowPinned: 'bottom' };

    render(<EditableCommentCellRenderer {...params} />);

    expect(baseRenderer).toHaveBeenCalled();
    expect(screen.getByText('Base Renderer')).toBeInTheDocument();
  });

  it('uses baseRenderer when data is null', () => {
    const params = createMockParams(textField);
    params.data = null;

    render(<EditableCommentCellRenderer {...params} />);

    expect(baseRenderer).toHaveBeenCalled();
    expect(screen.getByText('Base Renderer')).toBeInTheDocument();
  });

  it('returns null when no updateCommentValue provided', () => {
    const params = createMockParams(textField);
    params.updateCommentValue = undefined;

    const result = render(<EditableCommentCellRenderer {...params} />);

    expect(result.container.firstChild).toBeNull();
  });

  it('shows dropdown_dynamic options from dynamicOptions', () => {
    const dynamicField: CommentFieldConfig = {
      view_column: 'category',
      target_column: 'category_id',
      type: 'dropdown_dynamic',
      dataset_id: 42,
      value_column: 'id',
      label_column: 'name',
    };
    const dynamicOptions = {
      category_id: [
        { label: 'Cat A', value: 100 },
        { label: 'Cat B', value: 101 },
      ],
    };

    const params = createMockParams(dynamicField);
    params.editableField = dynamicField;
    params.data = { category: '' };
    params.dynamicOptions = dynamicOptions;

    render(<EditableCommentCellRenderer {...params} />);

    expect(screen.getByDisplayValue('Cat A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cat B')).toBeInTheDocument();
  });

  it('validates numeric input on change', () => {
    const params = createMockParams(numberField);
    render(<EditableCommentCellRenderer {...params} />);

    const input = screen.getByDisplayValue('10') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'invalid' } });
    expect(mockUpdateCommentValue).toHaveBeenCalledWith(
      rowIndex,
      numberField,
      'invalid',
      true,
    );

    fireEvent.change(input, { target: { value: '25.5' } });
    expect(mockUpdateCommentValue).toHaveBeenCalledWith(
      rowIndex,
      numberField,
      '25.5',
      false,
    );
  });
});
