# F-01 — AG-Grid Table V2

**Дата:** 2026-05  
**Статус:** ✅ Задеплоено  
**Коммиты:** `3a10735238`, `a7e539aa15`

## Что добавлено

Новый тип визуализации «Table AG-Grid V2» на базе библиотеки [AG-Grid Community](https://www.ag-grid.com/). Заменяет встроенную таблицу Superset в случаях, когда нужны расширенные возможности: фильтрация по столбцам, сортировка, пагинация на клиенте, редактируемые ячейки.

## Файлы

| Файл | Изменение |
|------|-----------|
| `superset-frontend/plugins/plugin-chart-ag-grid-table/` | Новый плагин (весь каталог) |
| `superset-frontend/src/visualizations/presets/MainPreset.ts` | Регистрация плагина через `AgGridTableChartPlugin` |
| `docker/pythonpath_dev/superset_config.py` | Feature flag `AG_GRID_TABLE_ENABLED: True` |
| `docker-compose-non-dev.yml` | Переменная окружения `AG_GRID_TABLE_ENABLED=true` |

## Архитектура плагина

```
plugin-chart-ag-grid-table/src/
├── AgGridTable.tsx          # Основной компонент (AG-Grid)
├── controlPanel.tsx         # Панель настроек в Explore
├── buildQuery.ts            # Формирование SQL-запроса
├── transformProps.ts        # Трансформация данных из Superset → props
├── types.ts                 # TypeScript-типы
└── index.ts                 # Экспорт плагина
```

## Регистрация плагина

`MainPreset.ts`:
```ts
import AgGridTableChartPlugin from '@superset-ui/plugin-chart-ag-grid-table';
// ...
const agGridTablePlugin = isFeatureEnabled(FeatureFlag.AgGridTableEnabled)
  ? [new AgGridTableChartPlugin().configure({ key: VizType.TableAgGrid })]
  : [];
```

`VizType.TableAgGrid = 'table_ag_grid'` — ключ, по которому Superset находит плагин.

## Feature flag

Плагин скрыт за флагом `AG_GRID_TABLE_ENABLED`. Без него тип визуализации не отображается в галерее.

```python
# superset_config.py
FEATURE_FLAGS = {
    "AG_GRID_TABLE_ENABLED": True,
}
```

## Зависимости

- `ag-grid-community` ^33.x
- `ag-grid-react` ^33.x
- Добавлены в `package.json` плагина
