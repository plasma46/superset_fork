# F-07 — Экспорт Excel с фильтрами дашборда

**Дата:** 2026-06  
**Статус:** 🔧 В процессе  
**Коммит:** `8424084623`

## Что добавлено

Два новых пункта меню в карточке чарта на дашборде:
- **Export to Excel (with dashboard filters)** — стандартный экспорт
- **Export to full Excel (with dashboard filters)** — полный экспорт без row_limit

При использовании этих пунктов применённые native filters дашборда записываются в первую строку Excel-файла в виде:
```
Примененные фильтры: Регион: Москва | Период: 2024-01 – 2024-12
```

## Файлы

### Frontend

| Файл | Изменение |
|------|-----------|
| `src/dashboard/types.ts` | +2 ключа `ExportXlsxWithFilters`, `ExportFullXlsxWithFilters` в enum `MenuKeys` |
| `src/dashboard/components/SliceHeaderControls/index.tsx` | Обновлены типы `exportXLSX`/`exportFullXLSX`, +2 case в `handleMenuClick`, +2 пункта в меню |
| `src/dashboard/components/gridComponents/Chart/Chart.tsx` | `exportTable` расширен параметром `includeDashboardFiltersInExcel`, `dataMask`/`nativeFilters` передаются в `exportFormData` |

### Backend

| Файл | Изменение |
|------|-----------|
| `superset/utils/excel.py` | `df_to_excel` принимает `export_header_text` — вставляет жирную строку над таблицей |
| `superset/common/query_context_processor.py` | +3 метода парсинга фильтров, ветка XLSX передаёт заголовок |

## Детали реализации

### Frontend: передача фильтров

В `Chart.tsx` при нажатии «с фильтрами» формируется `exportFormData`:
```ts
const exportFormData = {
  ...(isFullCSV ? { ...formData, row_limit: maxRows } : formData),
  include_dashboard_filters_in_excel: true,
  dataMask,      // состояние всех фильтров дашборда
  nativeFilters, // метаданные фильтров (имена, типы)
};
```

### Backend: сборка текста фильтров

`_build_dashboard_filters_excel_header()` в `QueryContextProcessor`:

1. Читает `dataMask` из `form_data` — состояние каждого native filter
2. Читает `nativeFilters` — для получения человекочитаемых имён фильтров
3. Для каждого активного фильтра берёт `filterState.label` (или `filterState.value`)
4. Формирует строку: `"Примененные фильтры: <name>: <value> | <name>: <value>"`

### Backend: запись в Excel

`df_to_excel` с параметром `export_header_text`:
- Смещает таблицу данных на 2 строки вниз (`data_startrow = startrow + 2`)
- В строку 0 записывает текст фильтров через `worksheet.merge_range()`
- Формат: жирный, `text_wrap`, высота строки 42px
- Ячейки объединяются по всей ширине таблицы (включая колонку индекса если есть)

## Формат меню (только для чарта типа table/ag-grid)

```
Export to .CSV
Export to Excel                          ← всегда видно
Export to Excel (with dashboard filters) ← всегда видно
--- (если AllowFullCsvExport и таблица)
Export to full .CSV
Export to full Excel
Export to full Excel (with dashboard filters)
```

## Ограничения

- Фильтры передаются в `form_data` как JSON — при больших объёмах `dataMask` размер запроса может вырасти
- `nativeFilters` содержит метаданные всех фильтров дашборда, включая неактивные — метод `_build_dashboard_filters_excel_header` фильтрует только те, у которых есть значение
- Если ни один фильтр не применён — заголовочная строка не добавляется, файл выглядит стандартно
