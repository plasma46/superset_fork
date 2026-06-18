import { t } from '@superset-ui/core';
import {
  ControlPanelConfig,
  sharedControls,
} from '@superset-ui/chart-controls';
import { validateNonEmpty } from '@superset-ui/core';

const controlPanel: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Запрос'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'stageColumn',
            config: {
              ...sharedControls.entity,
              label: t('Колонка этапа / периода'),
              description: t(
                'Колонка для горизонтальных этапов: дата отчёта, месяц, период',
              ),
              validators: [validateNonEmpty],
            },
          },
        ],
        [
          {
            name: 'flowColumns',
            config: {
              ...sharedControls.groupby,
              label: t('Группировка потока'),
              description: t(
                'Колонки, которые определяют один поток. Например: сегмент или сегмент + продукт',
              ),
              validators: [validateNonEmpty],
            },
          },
        ],
        ['metric'],
        ['adhoc_filters'],
        ['row_limit'],
      ],
    },
    {
      label: t('Настройки графика'),
      expanded: true,
      controlSetRows: [
        ['color_scheme'],
        [
          {
            name: 'zoom',
            config: {
              type: 'SliderControl',
              label: t('Масштаб'),
              default: 1,
              min: 0.5,
              max: 2,
              step: 0.1,
              renderTrigger: true,
              description: t('Управляет визуальным масштабом графика'),
            },
          },
        ],
        [
          {
            name: 'minColumnGap',
            config: {
              type: 'SliderControl',
              label: t('Расстояние между столбцами'),
              default: 200,
              min: 100,
              max: 350,
              step: 5,
              renderTrigger: true,
              description: t('Горизонтальное расстояние между периодами'),
            },
          },
        ],
        [
          {
            name: 'maxRows',
            config: {
              type: 'NumberControl',
              label: t('Максимум строк'),
              default: '',
              min: 1,
              max: 50,
              step: 1,
              isInt: true,
              renderTrigger: true,
              description: t(
                'Максимальное количество строк на один период. Оставьте пустым, чтобы показать все строки',
              ),
            },
          },
        ],
        [
          {
            name: 'sortDirection',
            config: {
              type: 'SelectControl',
              label: t('Направление ранжирования'),
              default: 'desc',
              renderTrigger: true,
              choices: [
                ['desc', t('Большие значения сверху')],
                ['asc', t('Малые значения сверху')],
              ],
            },
          },
        ],
        [
          {
            name: 'valueFormat',
            config: {
              type: 'TextControl',
              label: t('Формат значения'),
              default: '~s',
              renderTrigger: true,
            },
          },
          {
            name: 'dateFormat',
            config: {
              type: 'TextControl',
              label: t('Формат подписи периода'),
              default: '%d/%m/%y',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'labelSeparator',
            config: {
              type: 'TextControl',
              label: t('Разделитель групп'),
              default: ' · ',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'colorBy',
            config: {
              type: 'SelectControl',
              label: t('Цвет по'),
              default: 'first_group_column',
              renderTrigger: true,
              choices: [
                ['first_group_column', t('Первой колонке группировки')],
                ['full_flow', t('Полной комбинации групп')],
              ],
            },
          },
        ],
      ],
    },
  ],
};

export default controlPanel;