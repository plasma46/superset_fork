# F-08 — Плагин Rank Flow

**Дата:** 2026-06  
**Статус:** 🔧 В процессе  
**Коммит:** `68b54788e6`  
**Автор плагина:** внешний разработчик (передан как zip-архив)

## Что добавлено

Новый тип визуализации «Rank Flow» — SVG-диаграмма, показывающая как изменяется позиция (ранг) сущностей между стадиями/периодами. Пример: позиции SKU по выручке по месяцам.

## Файлы

| Файл | Изменение |
|------|-----------|
| `superset-frontend/plugins/plugin-chart-rank-flow/` | Плагин (весь каталог) |
| `superset-frontend/src/visualizations/presets/MainPreset.ts` | +импорт `RankFlowChartPlugin`, регистрация с ключом `'rank-flow'` |

## Структура плагина

```
plugin-chart-rank-flow/src/
├── PluginChartRankFlow.tsx   # SVG-компонент диаграммы
├── types.ts                   # RankFlowNode, RankFlowLink, RankFlowFormData, ...
├── index.ts                   # export { RankFlowChartPlugin }
└── plugin/
    ├── index.ts               # class RankFlowChartPlugin extends ChartPlugin
    ├── buildQuery.ts          # формирование запроса
    ├── controlPanel.ts        # панель настроек
    └── transformProps.ts      # трансформация данных → props
```

## Регистрация в MainPreset.ts

```ts
import { RankFlowChartPlugin } from '../../plugins/plugin-chart-rank-flow/src';
// ...
new RankFlowChartPlugin().configure({ key: 'rank-flow' }),
```

Импорт через относительный путь (не через npm-пакет) — плагин находится в монорепо в `plugins/`, которые включены в workspaces.

## Настройки визуализации

| Параметр | Описание |
|----------|----------|
| `stageColumn` | Колонка стадии (ось X) — дата, месяц, категория |
| `flowColumns` | Колонки группировки (что отображается как поток) |
| `metric` | Метрика для ранжирования |
| `sortDirection` | `desc` — высшее значение = 1-е место |
| `maxRows` | Максимум позиций на одну стадию |
| `colorBy` | Раскраска: по первой колонке группировки или по всему потоку |
| `zoom` | Масштаб (0.5 – 2.0) |
| `minColumnGap` | Расстояние между стадиями |
| `valueFormat` | Формат значений (d3-format: `~s`, `.2f`, ...) |
| `labelSeparator` | Разделитель при нескольких `flowColumns` |
| `showLegend` | Показывать легенду |

## Алгоритм transformProps

1. Агрегация: для каждой комбинации `(stage, flow)` суммируется метрика
2. Сортировка: по метрике внутри каждой стадии
3. Присвоение ранга (`rank`) и позиции (`step`)
4. Построение `nodes` (прямоугольники) и `links` (кривые Безье между стадиями)
5. Легенда: уникальные потоки с цветами из `CategoricalColorNamespace`

## Рендеринг

Чистый SVG без внешних зависимостей на charting-библиотеки:
- Узлы (`rect` + `text`) — позиционируются через `translate`
- Связи — кубические кривые Безье (`C` в SVG path)
- Tooltip — абсолютный `div` поверх SVG
- Легенда — `styled.div` с `button` элементами для hover-highlight

## Зависимости

Плагин использует из монорепо:
- `@superset-ui/core` — `CategoricalColorNamespace`, форматтеры, типы
- `@superset-ui/chart-controls` — `sharedControls`, `ControlPanelConfig`
- `d3-time-format` — форматирование дат в стадиях
- `@emotion/styled` — стилизация компонентов
- `react` — хуки, мемоизация

Все перечисленные пакеты уже присутствуют в `node_modules` монорепо Superset — отдельная установка не требуется.
