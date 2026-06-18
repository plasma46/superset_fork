import React, { useCallback } from 'react';
import { t } from '@superset-ui/core';
import { Button, Input, Select, Checkbox } from 'antd';
import type {
  CommentConfig,
  CommentFieldConfig,
  CommentKeyMapping,
  CommentFieldType,
  CommentOption,
} from './types';

const FIELD_TYPE_OPTIONS: { value: CommentFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown_static', label: 'Dropdown (static)' },
  { value: 'dropdown_dynamic', label: 'Dropdown (from DB)' },
];

function parseConfig(raw: unknown): CommentConfig {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as CommentConfig;
  return {};
}

type Props = {
  value?: unknown;
  onChange: (value: CommentConfig, errors: unknown[]) => void;
  datasourceColumns?: string[];
  [key: string]: unknown;
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'rgba(0,0,0,0.45)',
  margin: '10px 0 4px',
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  marginBottom: 6,
};

const label: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(0,0,0,0.45)',
  marginBottom: 2,
};

const CommentConfigControl: React.FC<Props> = ({
  value: rawValue,
  onChange,
  datasourceColumns = [],
}) => {
  const value = parseConfig(rawValue);

  const update = useCallback(
    (patch: Partial<CommentConfig>) => {
      onChange({ ...value, ...patch }, []);
    },
    [value, onChange],
  );

  const colOptions = datasourceColumns.map(c => ({ value: c, label: c }));

  /* ── Key mapping ─────────────────────────── */
  const keyMapping: CommentKeyMapping[] = value.key_mapping ?? [];

  const addKey = () =>
    update({
      key_mapping: [...keyMapping, { view_column: '', target_column: '' }],
    });

  const removeKey = (i: number) =>
    update({ key_mapping: keyMapping.filter((_, idx) => idx !== i) });

  const updateKey = (i: number, patch: Partial<CommentKeyMapping>) =>
    update({
      key_mapping: keyMapping.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r,
      ),
    });

  /* ── Fields ──────────────────────────────── */
  const fields: CommentFieldConfig[] = value.fields ?? [];

  const addField = () =>
    update({
      fields: [
        ...fields,
        { view_column: '', target_column: '', type: 'text' },
      ],
    });

  const removeField = (i: number) =>
    update({ fields: fields.filter((_, idx) => idx !== i) });

  const updateField = (i: number, patch: Partial<CommentFieldConfig>) =>
    update({
      fields: fields.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    });

  const addStaticOption = (fi: number) => {
    const opts: CommentOption[] = fields[fi].options ?? [];
    updateField(fi, { options: [...opts, { value: '', label: '' }] });
  };

  const removeStaticOption = (fi: number, oi: number) =>
    updateField(fi, {
      options: (fields[fi].options ?? []).filter((_, idx) => idx !== oi),
    });

  const updateStaticOption = (
    fi: number,
    oi: number,
    patch: Partial<CommentOption>,
  ) =>
    updateField(fi, {
      options: (fields[fi].options ?? []).map((o, idx) =>
        idx === oi ? { ...o, ...patch } : o,
      ),
    });

  return (
    <div style={{ paddingTop: 4 }}>

      {/* Connection */}
      <div style={sectionLabel}>{t('Connection')}</div>
      <div style={row}>
        <div style={{ flex: '0 0 70px' }}>
          <div style={label}>{t('DB ID')}</div>
          <Input
            size="small"
            type="number"
            value={value.database_id ?? ''}
            onChange={e =>
              update({
                database_id: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={label}>{t('Schema')}</div>
          <Input
            size="small"
            value={value.schema ?? ''}
            placeholder="public"
            onChange={e => update({ schema: e.target.value })}
          />
        </div>
        <div style={{ flex: 2 }}>
          <div style={label}>{t('Table')}</div>
          <Input
            size="small"
            value={value.table ?? ''}
            placeholder="comments"
            onChange={e => update({ table: e.target.value })}
          />
        </div>
      </div>

      {/* Key mapping */}
      <div style={sectionLabel}>{t('Key mapping')}</div>
      {keyMapping.map((km, i) => (
        <div key={i} style={row}>
          <Select
            size="small"
            style={{ flex: 1 }}
            options={colOptions}
            value={km.view_column || undefined}
            placeholder={t('Dataset column')}
            onChange={v => updateKey(i, { view_column: v })}
          />
          <span style={{ color: 'rgba(0,0,0,0.3)' }}>→</span>
          <Input
            size="small"
            style={{ flex: 1 }}
            value={km.target_column}
            placeholder={t('Comments table column')}
            onChange={e => updateKey(i, { target_column: e.target.value })}
          />
          <Button size="small" danger onClick={() => removeKey(i)}>✕</Button>
        </div>
      ))}
      <Button
        size="small"
        type="dashed"
        onClick={addKey}
        style={{ marginBottom: 4 }}
      >
        + {t('Add key')}
      </Button>

      {/* Comment fields */}
      <div style={{ ...sectionLabel, marginTop: 10 }}>{t('Comment fields')}</div>
      {fields.map((field, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            padding: '8px 8px 6px',
            marginBottom: 8,
          }}
        >
          <div style={row}>
            <Select
              size="small"
              style={{ flex: 1 }}
              options={colOptions}
              value={field.view_column || undefined}
              placeholder={t('Dataset column')}
              onChange={v => updateField(i, { view_column: v })}
            />
            <Input
              size="small"
              style={{ flex: 1 }}
              value={field.target_column}
              placeholder={t('Comments table column')}
              onChange={e => updateField(i, { target_column: e.target.value })}
            />
            <Select
              size="small"
              style={{ width: 155 }}
              options={FIELD_TYPE_OPTIONS}
              value={field.type}
              onChange={v => updateField(i, { type: v })}
            />
            <Button size="small" danger onClick={() => removeField(i)}>✕</Button>
          </div>

          {field.type === 'dropdown_static' && (
            <div style={{ paddingLeft: 8, marginTop: 4 }}>
              <div style={label}>{t('Options')}</div>
              {(field.options ?? []).map((opt, oi) => (
                <div key={oi} style={{ ...row, marginBottom: 4 }}>
                  <Input
                    size="small"
                    style={{ flex: 1 }}
                    value={String(opt.value)}
                    placeholder={t('Value')}
                    onChange={e =>
                      updateStaticOption(i, oi, { value: e.target.value })
                    }
                  />
                  <Input
                    size="small"
                    style={{ flex: 1 }}
                    value={opt.label}
                    placeholder={t('Label')}
                    onChange={e =>
                      updateStaticOption(i, oi, { label: e.target.value })
                    }
                  />
                  <Button size="small" danger onClick={() => removeStaticOption(i, oi)}>✕</Button>
                </div>
              ))}
              <Button size="small" type="dashed" onClick={() => addStaticOption(i)}>
                + {t('Add option')}
              </Button>
            </div>
          )}

          {field.type === 'dropdown_dynamic' && (
            <div style={{ paddingLeft: 8, marginTop: 4 }}>
              <div style={label}>{t('Source table')}</div>
              <div style={{ ...row, flexWrap: 'wrap' }}>
                <Input
                  size="small"
                  style={{ flex: '1 0 70px' }}
                  value={field.options_schema ?? ''}
                  placeholder={t('Schema')}
                  onChange={e =>
                    updateField(i, { options_schema: e.target.value })
                  }
                />
                <Input
                  size="small"
                  style={{ flex: '2 0 100px' }}
                  value={field.options_table ?? ''}
                  placeholder={t('Table')}
                  onChange={e =>
                    updateField(i, { options_table: e.target.value })
                  }
                />
                <Input
                  size="small"
                  style={{ flex: '1 0 70px' }}
                  value={field.options_value_column ?? ''}
                  placeholder={t('Value col')}
                  onChange={e =>
                    updateField(i, { options_value_column: e.target.value })
                  }
                />
                <Input
                  size="small"
                  style={{ flex: '1 0 70px' }}
                  value={field.options_label_column ?? ''}
                  placeholder={t('Label col')}
                  onChange={e =>
                    updateField(i, { options_label_column: e.target.value })
                  }
                />
              </div>
            </div>
          )}
        </div>
      ))}
      <Button
        size="small"
        type="dashed"
        onClick={addField}
        style={{ marginBottom: 4 }}
      >
        + {t('Add field')}
      </Button>

      {/* Options */}
      <div style={{ ...sectionLabel, marginTop: 10 }}>{t('Options')}</div>
      <div style={{ marginBottom: 6 }}>
        <Checkbox
          checked={Boolean(value.bulk_input)}
          onChange={e => update({ bulk_input: e.target.checked })}
        >
          {t('Enable mass input')}
        </Checkbox>
      </div>
      <div style={{ ...row, alignItems: 'center' }}>
        <span style={{ ...label, marginBottom: 0, whiteSpace: 'nowrap' }}>
          {t('Refresh chart ID')}
        </span>
        <Input
          size="small"
          type="number"
          style={{ width: 80 }}
          value={value.refresh_chart_id ?? ''}
          onChange={e =>
            update({
              refresh_chart_id: e.target.value
                ? Number(e.target.value)
                : undefined,
            })
          }
        />
      </div>
    </div>
  );
};

export default CommentConfigControl;
