# Superset Fork — рабочий журнал

## Участники
- **Dmitry** — продукт, тестирование
- **Agent-1** (этот чат) — backend/frontend, деплой
- **Agent-2** — (подключается по необходимости)

## Правила
- Перед началом работы — прочитай этот файл
- После изменений — добавь запись в раздел `## Лог` (см. правила архивации внизу)
- Ветка для работы: `master` в `plasma46/superset_fork`
- Деплой: `python deploy/deploy_superset.py`

---

## Инфраструктура

| Компонент | Адрес |
|-----------|-------|
| Superset (прямой) | http://85.193.80.29:8088 |
| Superset (nginx+gzip) | http://85.193.80.29 |
| SSH | root@85.193.80.29 |
| Репо | https://github.com/plasma46/superset_fork |

Креды: `deploy/server.env`

### Активные конфиги (важно помнить)
- `ENABLE_TEMPLATE_PROCESSING=True` — Jinja в SQL включена
- `HTML_SANITIZATION=False` — HTML-меры (ссылки и т.д.) рендерятся без вырезания
- Файл: `docker/pythonpath_dev/superset_config.py`

---

## Решённые задачи (рецепты)

### Передача значения из одного дашборда в другой через ссылку
**Способ:** строим полный URL прямо в Jinja внутри SQL датасета — без правок фронтенда.

```sql
{% set url = '/superset/dashboard/225/?native_filters=(' %}
CONCAT(
'{{ url }}',
'NATIVE_FILTER-w-MinVBIlrnFon9qydBap:(__cache:(label:%27',
plant_producer_name,
'%27,validateStatus:!f,value:!(%27',
REPLACE(plant_producer_name, ' ', '%20'),
'%27)),extraFormData:(filters:!((col:plant_producer_name,op:IN,val:!(%27',
REPLACE(plant_producer_name, ' ', '%20'),
'%27)))),filterState:(label:%27',
plant_producer_name,
'%27,validateStatus:!f,value:!(%27',
REPLACE(plant_producer_name, ' ', '%20'),
'%27)),id:NATIVE_FILTER-w-MinVBIlrnFon9qydBap,ownState:())',
',', -- разделитель между фильтрами, без пробела
-- второй фильтр аналогично, своя пара скобок
')'
) as url_param_full
```

**Важно:** каждый блок `FILTER_ID:(...)` должен сам закрываться `)` перед запятой/финальной скобкой — частая ошибка при добавлении второго фильтра (см. архив, 2026-06-15).

**Работает и для строки, и для столбца pivot table** — если оба значения это обычные колонки в одной строке SQL (агрегация по двум полям), оба доступны в Jinja одновременно.

~~Альтернатива (отклонена): `xf-nav-link` — JS-перехватчик клика, читающий Redux dataMask.~~ Откатан 2026-06-15, избыточен — Jinja-подход проще и не требует деплоя фронтенда.

---

## АКТИВНАЯ ЗАДАЧА: Редактируемые комментарии в ag-grid Table V2

### Цель
В чарте Table V2 (ag-grid, `plugin-chart-ag-grid-table`) пользователь может вводить значения
(текст / число / выпадающий список) прямо в строки таблицы и сохранять их как запись
в отдельной "таблице комментариев" в любой БД, подключённой к Superset. Удаление — это
тот же INSERT с флагом `is_delete=true` (append-only лог, не настоящий DELETE).

### Разделение работы

| Кто | Что делает | Файлы |
|-----|-----------|-------|
| **Agent-1** (backend) | REST API, permission, SQLAlchemy INSERT, тестовая таблица, pytest | `superset/charts/api.py`, `superset/charts/comments/` (новый модуль), `superset/security/manager.py`, `tests/unit_tests/charts/` |
| **Agent-2** (frontend) | Control Panel, ag-grid редактируемые ячейки, bulk-select, Save, force-refresh, Jest | `superset-frontend/plugins/plugin-chart-ag-grid-table/` |

**Граница:** Agent-2 не трогает `superset/` (Python). Agent-1 не трогает
`superset-frontend/plugins/plugin-chart-ag-grid-table/`. Общая точка — только API-контракт ниже.

### API-контракт (зафиксирован, менять только по согласованию)

```
POST /api/v1/chart/<chart_id>/comments
```

Request:
```json
{
  "records": [
    {
      "keys": { "plant_id": "А-12", "month": "2026-06" },
      "fields": { "comment_text": "Проверено", "qty_value": 15, "status_id": 2 },
      "is_delete": false
    }
  ]
}
```

Response 200:
```json
{ "inserted": 1 }
```
Errors: `400` (validation), `403` (нет permission), `404` (comments не настроены на чарте), `422` (type mismatch, с деталями по полю).

**Permission:** `can_write` на view menu `Comments` (роль назначается админом в Superset UI как обычно).

**Конфиг чарта** (`form_data.comment_config`, пишет Control Panel, читает backend):
```json
{
  "enabled": true,
  "database_id": 1,
  "schema": "public",
  "table": "demo_comments",
  "key_mapping": [{"view_column": "plant_id", "target_column": "plant_id"}],
  "fields": [
    {"view_column": "comment_text", "target_column": "comment_text", "type": "text"},
    {"view_column": "qty", "target_column": "qty_value", "type": "number"},
    {"view_column": "status", "target_column": "status_id", "type": "dropdown_static",
     "options": [{"label": "Open", "value": 1}, {"label": "Closed", "value": 2}]},
    {"view_column": "category", "target_column": "category_id", "type": "dropdown_dynamic",
     "dataset_id": 42, "value_column": "id", "label_column": "name"}
  ],
  "refresh_chart_id": 99
}
```

### Тестовая таблица (демо-схема, Agent-1 создаёт)
```sql
CREATE TABLE demo_comments (
  id SERIAL PRIMARY KEY,
  plant_id VARCHAR(255),
  month VARCHAR(255),
  comment_text TEXT,
  qty_value NUMERIC,
  status_id INTEGER,
  category_id INTEGER,
  is_delete BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Договорённости с пользователем (2026-06-15)
- Чтение текущего значения комментария — забота пользователя (JOIN в его SQL датасета), фича только пишет
- Save — одна кнопка независимо от количества изменённых строк, момент вызова решает фронтенд-агент по UX
- Force refresh — `dispatch(refreshChart(chartId, true, dashboardId))` из `src/components/Chart/chartAction.ts`, чарт всегда на том же дашборде
- Массовый ввод: чекбоксы на строках → кнопка "Mass input" → одно значение → применяется ко всем выбранным
- Dropdown "из другой таблицы" — простой вариант: грузится один раз при монтировании компонента, не на каждый рендер
- БД для INSERT — выбирается в Control Panel из существующих Database connections Superset (через `database_id`)
- Тесты: backend pytest (обязательно — новый API с правами и SQL), frontend Jest на валидацию/payload/bulk-логику. Cypress/e2e — не в первой итерации

### Статус: 📋 Распределено, в работе

### 2026-06-15
- Решена задача передачи фильтров между дашбордами — через Jinja-URL в SQL (см. "Решённые задачи" выше)
- Откатан `xf-nav-link` (3 коммита) — пользователь нашёл более простой путь без правок фронтенда
- Конфиги (`ENABLE_TEMPLATE_PROCESSING`, `HTML_SANITIZATION`) и деплой-фиксы оставлены
- Спроектирована фича "комментарии в ag-grid Table V2", работа разделена между Agent-1 (backend) и Agent-2 (frontend), контракт зафиксирован выше

---

## Архивация

Когда раздел `## Лог` превышает ~10 записей или файл становится тяжело читать:
1. Создать `deploy/worklog_archive/YYYY-MM.md`
2. Перенести туда записи старше текущей недели целиком (копипаст, без изменений)
3. В `## Лог` оставить только последние активные записи + ссылку:
   `См. также: [архив за июнь 2026](worklog_archive/2026-06.md)`

Раздел "Решённые задачи" **не архивируется** — это живой справочник рецептов, актуальный всегда.
