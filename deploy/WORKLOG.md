# Superset Fork — рабочий журнал

## Участники
- **Dmitry** — продукт, тестирование
- **Agent-1** (этот чат) — backend/frontend, деплой
- **Agent-2** — (подключается по необходимости)

## Инструкция для агентов

### Обязательно при старте сессии
1. Прочитай этот файл целиком — контекст, инфраструктура, активные задачи
2. Прочитай `docs/fork-changes/CHANGELOG.md` — реестр всех изменений форка
3. Если задача касается конкретной фичи — прочитай её `docs/fork-changes/features/F-xx-*.md`

### Правила разработки
- Ветка для работы: `master` в `plasma46/superset_fork` (локально `fork-base-6.1.0`)
- **Никогда не делай деплой без явного ОК от Dmitry** («деплой», «давай», «да»)
- **Никогда не запускай npm/pip install локально** — только через контейнеры на удалённом сервере
- Не трогай файлы вне своей зоны ответственности без согласования
- Перед коммитом убедись что изменения компилируются (TypeScript) и не ломают соседние модули

### Деплой
```
python deploy/run_remote.py --bg "cd /opt/superset && git pull && docker compose -f docker-compose-non-dev.yml build --no-cache superset && docker compose -f docker-compose-non-dev.yml up -d"
```
SSH может быть нестабилен (брутфорс атаки). Если падает — повтори через 10–20 секунд.  
Порт SSH: **2222** (не 22). Конфиг: `deploy/server.env`.

### Тестирование
- Backend (pytest): `docker exec superset_app pytest <path>`
- Frontend (Jest): поднять временный `node:22` контейнер на сервере, монтировать `/opt/superset`, запускать `npx jest`
- **Важно для Jest**: путь монтирования должен содержать `/superset-frontend/` — иначе testRegex не находит тесты

### Документация
- После завершения любого изменения — **обновить или создать** файл в `docs/fork-changes/features/`
- Добавить или обновить строку в `docs/fork-changes/CHANGELOG.md`
- Статусы: ✅ Задеплоено / 🔧 В процессе / 📝 Запланировано
- Нумерация: F-01, F-02, ... — следующая свободная (сейчас F-09)

### После деплоя
- Запустить `deploy/assign_comments_permission.py` если деплоилась backend-часть комментариев:
  ```
  python deploy/run_remote.py "docker exec superset_app python /app/deploy/assign_comments_permission.py"
  ```
- Проверить что контейнер поднялся: `docker ps` должен показать `superset_app` со статусом `healthy`

### Ведение лога
- После изменений — добавь запись в раздел `## Лог` внизу этого файла
- Формат: `### YYYY-MM-DD — Agent-X (краткое название задачи)`
- Что писать: что изменено, какие файлы, коммиты, статус тестов, что делать дальше

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

### Статус: ✅ Задеплоено, Table V2 доступна, готово к ручному тестированию

### 2026-06-16 — Agent-1 (диагностика "V2 недоступна")
- Пользователь сообщил: второй агент пытался включить Table V2 и задеплоить, но деплой не дошёл до конца — V2 не выбирается в UI
- Диагностика: `AG_GRID_TABLE_ENABLED` по умолчанию `True` в `DEFAULT_FEATURE_FLAGS` (`superset/config.py`), и merge с кастомным `FEATURE_FLAGS` в `docker/pythonpath_dev/superset_config.py` устроен как `dict.update()` — не ломает дефолты. Коммит `a7e539aa15` (явно добавил `AG_GRID_TABLE_ENABLED: True` в конфиг) был корректным и уже в `master`.
- Реальная причина: **контейнер на сервере не пересобрался** после этого коммита — второй агент закоммитил, но деплой до образа не дошёл (или не запускался). Проверка прямо в работающем `superset_app` показала `AG_GRID_TABLE_ENABLED: False` — старый образ.
- Фикс: повторный `python deploy/deploy_superset.py` (полная пересборка, ~6 минут — быстрее первого деплоя за счёт частичного кэша). После деплоя проверено напрямую в контейнере: `AG_GRID_TABLE_ENABLED: True`.
- **Урок:** после любого коммита, который должен повлиять на runtime-конфиг или фронтенд — деплой обязателен и должен быть подтверждён до конца (проверять `docker ps` на `healthy` и сверять фактическое значение конфига в контейнере, а не только успешный git push/commit).

### 2026-06-15
- Решена задача передачи фильтров между дашбордами — через Jinja-URL в SQL (см. "Решённые задачи" выше)
- Откатан `xf-nav-link` (3 коммита) — пользователь нашёл более простой путь без правок фронтенда
- Конфиги (`ENABLE_TEMPLATE_PROCESSING`, `HTML_SANITIZATION`) и деплой-фиксы оставлены
- Спроектирована фича "комментарии в ag-grid Table V2", работа разделена между Agent-1 (backend) и Agent-2 (frontend), контракт зафиксирован выше

---

## Лог

### 2026-06-16 — Agent-1 (backend/Table V2 comments)
- Реализован `POST /api/v1/chart/<pk>/comments`:
  - `superset/commands/chart/comments.py` (новый) — `InsertChartCommentsCommand`: читает `form_data.comment_config`, валидирует ключи/типы (text/number/dropdown_static строго; dropdown_dynamic не валидируется на бэке — см. договорённости), строит INSERT через SQLAlchemy Core с reflected table (`autoload_with=engine`) — защита от SQL-инъекций на уровне колонок и значений.
  - `superset/commands/chart/exceptions.py` — добавлены `CommentsConfigError` (404), `CommentsValidationError` (422), `CommentsForbiddenError` (403), `CommentsDatabaseNotFoundError` (404).
  - `superset/charts/api.py` — новый route `post_comments` на `ChartRestApi`, добавлен в `include_route_methods`.
  - `superset/security/manager.py` — зарегистрирован permission `can_write` / view menu `Comments` в `create_custom_permissions()`. Нужно зайти в Superset UI → Roles и вручную добавить `can_write on Comments` нужным ролям (permission создаётся при старте приложения, но не назначается ролям автоматически).
  - `tests/unit_tests/charts/commands/test_comments.py` (новый) — 16 тестов (15 passed + 1 skipped намеренно), покрывают: chart not found, permission denial, config missing/disabled, missing key, unknown field, числовая валидация (валид/невалид), dropdown_static валидация, database not found, сборку INSERT-строк (включая `is_delete`), пустой `records`.
- Создана демо-таблица `demo_comments` в Postgres (`superset_db` контейнер, схема `public`) — протестирован реальный INSERT (обычная запись + `is_delete=true`), см. SQL-схему в разделе "Тестовая таблица" выше.
- Тесты прогнаны внутри `superset_app` контейнера (`docker exec ... pytest`), не в продовом образе — `tests/` не запечён в `docker-compose-non-dev.yml` сборку, копировал файлы вручную через `docker cp` для верификации. Тесты в репо актуальны и будут подхвачены при следующей полной пересборке (`docker compose up --build`).
- Закоммичено (`649de7dea2`), **не запушено** — жду пока Agent-2 закоммитит фронтенд, чтобы избежать двух параллельных push в одну ветку.
- Замечание по фронтенд-части (видел в этом же файле выше): Jest не запущен у Agent-2 (`node_modules` отсутствует, `npm.cmd test` падает на `cross-env`). Тесты написаны, но не верифицированы — нужно поднять `yarn install` в `superset-frontend` и прогнать перед тем как считать фичу полностью готовой.

### 2026-06-16 — Agent-1 (frontend/Table V2 comments)
- В рамках frontend-части активной задачи изменён только `superset-frontend/plugins/plugin-chart-ag-grid-table/`:
  - `src/types.ts`: добавлены типы `CommentConfig`, `CommentFieldConfig`, `CommentDirtyState`, payload records; `formData.comment_config` поддерживает объект или JSON-строку.
  - `src/utils/commentEditing.ts`: добавлены pure helpers для composite row key, number validation, bulk apply, save/delete payload.
  - `src/transformProps.ts`: `formData.comment_config` прокидывается в `AgGridTableChart`.
  - `src/controlPanel.tsx`: добавлена секция `Comments`; `comment_config` сохраняется под `form_data.comment_config`, helper JSON-поля очищаются из итогового form_data.
  - `src/AgGridTable/index.tsx`: добавлен callback `onSelectedRowsChange` поверх существующего `onSelectionChanged`.
  - `src/AgGridTableChart.tsx`: добавлены checkbox bulk-select, editable comment columns, dirty-state, Mass input, Save/Delete через `POST /api/v1/chart/<chart_id>/comments`, dynamic dropdown options через `/api/v1/dataset/<id>/data/`, success/error toasts, optional `refreshChart`.
  - `test/utils/commentEditing.test.ts`: добавлены Jest-тесты helper-логики: number validation, single/bulk payload, mass input, dirty clear model.
- Как тестировать вручную:
  1. Включить Table V2 (`AG_GRID_TABLE_ENABLED=True`) и создать chart `ag-grid-table`.
  2. В секции Comments заполнить `comment_config` JSON по контракту из активной задачи.
  3. Открыть дашборд, изменить text/number/dropdown ячейки, проверить что Save активируется.
  4. Выбрать 2+ строки чекбоксами, нажать `Mass input`, применить значение, затем Save.
  5. Проверить Delete на строке: должен уйти payload с `is_delete: true`.
  6. Если задан `refresh_chart_id`, после успешного Save/Delete должен обновиться указанный chart.
- Как тестировать через Jest:
  - Из `superset-frontend`: `npm.cmd test -- --runInBand plugins/plugin-chart-ag-grid-table/test/utils/commentEditing.test.ts plugins/plugin-chart-ag-grid-table/test/controlPanel.test.ts`
- Проверки:
  - `git diff --check -- superset-frontend/plugins/plugin-chart-ag-grid-table` — OK.
  - ~~Jest не запущен локально~~ — **прогнан на сервере** (см. запись 2026-06-16 Agent-1 (3) ниже): 5/5 passed.
- Отклонение/ограничение:
  - В Control Panel для сложных массивов `key_mapping` и `fields` использован JSON editor/helper, а не полноценный визуальный dynamic rows builder. Backend-контракт не изменён: итоговый `form_data.comment_config` остаётся объектом с согласованной структурой.

### 2026-06-16 — Agent-1 (3) — верификация на сервере
- **Правило:** никаких локальных npm/pip install — всё тестируется на удалённом сервере (контейнеры/временные docker-контейнеры). См. память агента `feedback_no_local_installs`.
- Backend: 15/16 pytest passed (1 skip намеренный) — прогнано внутри `superset_app` контейнера через `docker cp` + `docker exec pytest`. Реальный INSERT проверен в `demo_comments` (Postgres), включая `is_delete=true`.
- Frontend Jest: поднят временный `node:22` контейнер на сервере с volume на `/opt/superset` (важно монтировать с сохранением пути `.../superset-frontend/...` — testRegex в jest-конфиге требует литеральный `/superset-frontend/` в пути, монтирование под другим именем даёт "0 matches"). `npm ci` + `npx jest plugins/plugin-chart-ag-grid-table/test/utils/commentEditing.test.ts` → **5/5 passed**.
- Создан `deploy/assign_comments_permission.py` — назначает `can_write`/`Comments` роли Admin (запускать через `docker exec -i superset_app superset shell < deploy/assign_comments_permission.py` после деплоя, т.к. FAB создаёт permission но не назначает его ролям автоматически).
- Дальше: полный деплой (`docker compose up --build`) + назначение permission + ручная E2E проверка (создать чарт, настроить comment_config, сохранить комментарий, проверить запись в БД).

### 2026-06-17 — Agent-1 (BACK-6: embed comment fields into native dataset columns)
- Рефакторинг system комментариев завершён:
  - `src/renderers/EditableCommentCellRenderer.tsx` (новый) — универсальный компонент для editable UI (text/number/dropdown), поддерживает все 4 типа полей
  - `src/utils/commentEditing.ts` — добавлены `getEditableField()` и `getCommentableFieldsMap()` для поиска editable полей в config
  - `src/utils/useColDefs.ts` — расширена функция чтобы при построении colDefs встраивать editable renderer в существующие колонки датасета (если view_column совпадает)
  - `src/AgGridTableChart.tsx` — удалены `editableCols` (дополнительные колонки), теперь передаются commentConfig параметры в useColDefs
  - `test/renderers/EditableCommentCellRenderer.test.tsx` (новый) — 11 unit-тестов для renderer логики
- Результат: comment-поля больше не добавляются как отдельные колонки — они встроены в existing colDefs, поэтому видны в Control Panel "Customize columns" и поддерживают алиасы/форматирование
- Коммиты: 91cb0f4ff2 (реализация BACK-6), bf2d35e3de (обновление документации), c5cbb799e2 (тесты)
- Backend-контракт не изменился, API `/api/v1/chart/{id}/comments` остаётся без изменений
- Ветка: fork-base-6.1.0 (впереди master)
- Next: деплой на сервер и E2E тестирование

### 2026-06-17 — Agent-1 (bugfix: кнопка Create заблокирована)
- Симптом: при создании нового чарта Table V2 кнопка «Создать» оставалась неактивной после добавления колонок.
- Причина: `comment_key_mapping_json` и `comment_fields_json` имели `validators: [validateJsonArray]` + `resetOnHide: false`. Superset сохраняет состояние и валидаторы скрытых контролов с `resetOnHide: false`, что блокировало форму даже когда секция Comments отключена.
- Фикс: убраны `validators` из обоих хелпер-контролов и неиспользуемая функция `validateJsonArray`. Коммит `55336a3411`, задеплоено.

---

## Архивация

Когда раздел `## Лог` превышает ~10 записей или файл становится тяжело читать:
1. Создать `deploy/worklog_archive/YYYY-MM.md`
2. Перенести туда записи старше текущей недели целиком (копипаст, без изменений)
3. В `## Лог` оставить только последние активные записи + ссылку:
   `См. также: [архив за июнь 2026](worklog_archive/2026-06.md)`

Раздел "Решённые задачи" **не архивируется** — это живой справочник рецептов, актуальный всегда.
