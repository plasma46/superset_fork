# F-03 — Визуальный UI конфигурации комментариев

**Дата:** 2026-06  
**Статус:** 🔧 В процессе (деплой ожидается)  
**Коммиты:** `a3172986af`, `b59a82cd38`

## Что добавлено

Замена восьми отдельных JSON TextArea-контролов в панели настроек чарта на единый визуальный компонент `CommentConfigControl`. Теперь поля ключей и колонки датасета выбираются через дропдауны, а не вводятся вручную как JSON.

## Проблема

До этого изменения пользователи вынуждены были вручную писать JSON в текстовые поля, что приводило к ошибкам. Также был баг `[object Object]` в `SelectControl` при попытке использовать колонки датасета — исправить через стандартный `SelectControl` не удалось (4 итерации), поэтому был создан кастомный компонент.

## Файлы

| Файл | Изменение |
|------|-----------|
| `src/CommentConfigControl.tsx` | Новый компонент — замена всех 8 контролов |
| `src/controlPanel.tsx` | Один контрол `comment_config` вместо восьми |

## Архитектура CommentConfigControl

Компонент передаётся напрямую как `type` в конфиг контрола — без регистрации в фабрике контролов Superset. Это стандартный паттерн из `Control.tsx`:

```ts
// Control.tsx (ядро Superset)
const ControlComponent = typeof type === 'string'
  ? controlMap[type]
  : type;  // ← если тип — React-компонент, используется напрямую
```

В controlPanel.tsx:
```ts
{
  name: 'comment_config',
  config: {
    type: CommentConfigControl,          // компонент напрямую
    shouldMapStateToProps: () => true,   // пересчёт при смене датасета
    mapStateToProps: ({ form_data, datasource }) => {
      const cols = (datasource?.columns ?? [])
        .map(c => c.column_name)
        .filter(Boolean);
      return { value: cfg ?? {}, datasourceColumns: cols };
    },
  },
}
```

## Секции UI

### Connection
Поля: DB ID (число), Schema (текст), Table (текст) — в одну строку.

### Key mapping
Динамический список строк: `[Select колонки датасета] → [Input колонки таблицы комментариев]`  
Кнопки: «+ Add key», «✕» для удаления строки.

### Comment fields
Каждое поле — карточка с:
- Select колонки датасета
- Input колонки таблицы комментариев
- Select типа (`text` / `number` / `dropdown_static` / `dropdown_dynamic`)
- Расширенная конфигурация для dropdown-типов:
  - `dropdown_static` → список value/label пар
  - `dropdown_dynamic` → поля Schema, Table, Value col, Label col

### Options
- Чекбокс «Enable mass input»
- Input «Refresh chart ID»

## Почему antd Select, а не Superset SelectControl

`SelectControl` преобразовывал строковые значения во внутренние объекты через `innerGetOptions`, что приводило к `[object Object]` при отображении. Прямое использование `antd/Select` с `options={datasourceColumns.map(c => ({ value: c, label: c }))}` обходит эту проблему.

## Известная проблема (исправлена)

При использовании `@ant-design/icons` (PlusOutlined, DeleteOutlined) возникала ошибка `TypeError: (0, y1.t) is not a function` в минифицированном бандле. Решение — заменить иконки на текстовые символы `+` и `✕` (коммит `b59a82cd38`).
