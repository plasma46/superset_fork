# Superset Fork — рабочий журнал

## Участники
- **Dmitry** — продукт, тестирование
- **Agent-1** (этот чат) — backend/frontend, деплой
- **Agent-2** — (подключается по необходимости)

## Правила
- Перед началом работы — прочитай этот файл
- После изменений — добавь запись в раздел `## Лог`
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

---

## Текущая задача: Кросс-фильтрация и передача фильтров между дашбордами

### Цель
Pivot table (сводник) с HTML-мерой содержит ссылку. При клике на строку
(применяется кросс-фильтр) → клик по ссылке → открывается другой дашборд
с этим же значением в Native Filter.

### Статус: 🚀 Задеплоено, ожидает тестирования

### Как пользоваться (шаблон SQL)
```sql
'<a class="xf-nav-link"
    data-dashboard="225"
    data-filter-id="NATIVE_FILTER-XXXXX"
    data-column="plant_producer_name"
    href="#">' ~ label ~ '</a>'
```
- `data-dashboard` — id целевого дашборда
- `data-filter-id` — id Native Filter на целевом дашборде
- `data-column` — колонка по которой кросс-фильтруешь

### Что нужно протестировать
- [ ] Включить кросс-фильтрацию на дашборде (Edit → Enable cross-filters)
- [ ] Кликнуть на строку в pivot table → убедиться что кросс-фильтр применился
- [ ] Кликнуть по ссылке → Dashboard B открывается с нужным фильтром
- [ ] Проверить что `HTML_SANITIZATION=False` — ссылки рендерятся, не вырезаются
- [ ] Проверить что Jinja работает в SQL (filter_values() и т.д.)

### Открытые вопросы
- Нужно ли передавать несколько колонок одновременно?
- Поведение если кросс-фильтр не выбран (ссылка ведёт без фильтра или не ведёт?)

---

## Лог

### 2026-06-15 — Agent-1 (2)
- Реализован механизм `xf-nav-link`: клик по HTML-ссылке в чарте читает кросс-фильтры из Redux dataMask и открывает целевой дашборд с `native_filters` в URL
- Файл: `superset-frontend/src/dashboard/components/DashboardBuilder/DashboardBuilder.tsx`
- Нужно: задеплоить и протестировать (см. инструкцию ниже)

### 2026-06-15 — Agent-1 (3)
- `docker/pythonpath_dev/superset_config.py`: включён `ENABLE_TEMPLATE_PROCESSING=True`, выключен `HTML_SANITIZATION=False`
- `deploy/deploy_superset.py`: добавлен retry для SSH (6 попыток), исправлен git fetch (--no-tags, сброс fetchspec)
- `deploy/server.env` (локально): `SUPERSET_LOAD_EXAMPLES=yes` — примеры загрузятся при деплое
- Деплой запущен, идёт сборка фронтенда

### 2026-06-15 — Agent-1 (2)
- Реализован `xf-nav-link` в `DashboardBuilder.tsx` — клик по HTML-ссылке читает кросс-фильтры из Redux и открывает целевой дашборд с `?native_filters=<rison>`

### 2026-06-15 — Agent-1 (1)
- Поднят сервер, настроен nginx с gzip перед Superset на порту 80
- Деплой-скрипт переключён на `plasma46/superset_fork`
- Добавлены `REPO_URL`, `REPO_BRANCH` в `deploy/server.env`
- Форк запушен в `https://github.com/plasma46/superset_fork`
