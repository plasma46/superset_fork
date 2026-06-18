import {
  ControlPanelConfig,
  sharedControls,
} from '@superset-ui/chart-controls';
import { validateNonEmpty } from '@superset-ui/core';

const controlPanel: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: 'Запрос',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'stageColumn',
            config: {
              ...sharedControls.entity,
              label: 'Колонка этапа / периода',
              description: 'Колонка для горизонтальной оси: дата, месяц, период',
              validators: [validateNonEmpty],
            },
          },
        ],
        [
          {
            name: 'flowColumns',
            config: {
              ...sharedControls.groupby,
              label: 'Группировка потоков',
              description: 'Колонки, которые определяют один поток. Например: категория или продукт + регион',
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
      label: 'Настройки графика',
      expanded: true,
      controlSetRows: [
        ['color_scheme'],
        [
          {
            name: 'zoom',
            config: {
              type: 'SliderControl',
              label: 'Масштаб',
              default: 1,
              min: 0.5,
              max: 2,
              step: 0.1,
              renderTrigger: true,
              description: 'Масштабирование элементов графика',
            },
          },
        ],
        [
          {
            name: 'minColumnGap',
            config: {
              type: 'SliderControl',
              label: 'Расстояние между периодами',
              default: 200,
              min: 100,
              max: 350,
              step: 5,
              renderTrigger: true,
              description: 'Горизонтальное расстояние между периодами',
            },
          },
        ],
        [
          {
            name: 'maxRows',
            config: {
              type: 'NumberControl',
              label: 'Максимум строк',
              default: '',
              min: 1,
              max: 50,
              step: 1,
              isInt: true,
              renderTrigger: true,
              description: 'Максимальное количество строк на один период. Оставьте пустым, чтобы показать все записи',
            },
          },
        ],
        [
          {
            name: 'sortDirection',
            config: {
              type: 'SelectControl',
              label: 'Направление сортировки',
              default: 'desc',
              renderTrigger: true,
              choices: [
                ['desc', 'Высшее значение сверху'],
                ['asc', 'Низшее значение сверху'],
              ],
            },
          },
        ],
        [
          {
            name: 'valueFormat',
            config: {
              type: 'TextControl',
              label: 'Формат значения',
              default: '~s',
              renderTrigger: true,
            },
          },
          {
            name: 'dateFormat',
            config: {
              type: 'TextControl',
              label: 'Формат метки периода',
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
              label: 'Разделитель групп',
              default: ' ÷ ',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'colorBy',
            config: {
              type: 'SelectControl',
              label: 'Цвет по',
              default: 'first_group_column',
              renderTrigger: true,
              choices: [
                ['first_group_column', 'Первой колонке группировки'],
                ['full_flow', 'Полной комбинации потока'],
              ],
            },
          },
        ],
        [
          {
            name: 'showLegend',
            config: {
              type: 'CheckboxControl',
              label: 'Показать легенду',
              default: true,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default controlPanel;
