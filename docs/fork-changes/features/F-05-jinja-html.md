# F-05 — Jinja-шаблонизация и HTML в датасетах

**Дата:** 2026-05  
**Статус:** ✅ Задеплоено  
**Коммит:** `258b611...` (config: enable Jinja templating and disable HTML sanitization)

## Что добавлено

Включены две возможности Superset, которые по умолчанию отключены:

1. **Jinja-шаблонизация в SQL** — позволяет использовать `{{ ... }}` в SQL датасетов для динамических значений, фильтров, параметров
2. **HTML-рендеринг в ячейках таблицы** — позволяет отображать HTML-разметку (ссылки, иконки) прямо в ячейках

## Файлы

| Файл | Изменение |
|------|-----------|
| `docker/pythonpath_dev/superset_config.py` | Feature flags и настройки |

## Конфигурация

```python
FEATURE_FLAGS = {
    "ENABLE_TEMPLATE_PROCESSING": True,   # Jinja в SQL
    "DISPLAY_MARKDOWN_HTML": True,        # HTML в MarkDown-полях
}

# Отключение HTML-санитизации для таблиц
HTML_SANITIZATION = False
# или для конкретных элементов:
HTML_SANITIZATION_SCHEMA_EXTENSIONS = {
    "attributes": {"*": ["style", "class", "href", "target"]},
    "tagNames": ["a", "span", "div", "b", "i"],
}
```

## Jinja в SQL — доступные переменные

```sql
-- Текущий пользователь
SELECT * FROM orders WHERE manager = '{{ current_username() }}'

-- Параметры фильтра
SELECT * FROM sales WHERE date >= '{{ from_dttm }}'

-- Произвольный параметр
SELECT * FROM data WHERE region = '{{ url_param("region") }}'
```

## Безопасность

HTML-санитизация отключена — это означает, что **контент из БД рендерится как HTML без экранирования**. Допустимо только если данные в БД доверенные. Не рекомендуется для публичных инстансов.
