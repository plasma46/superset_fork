-- Test data for ag-grid Table V2 comments feature
-- Run via: docker exec -i superset_db psql -U superset -d superset < /opt/superset/deploy/init_test_data.sql

-- Dropdown dictionaries in a separate schema
CREATE SCHEMA IF NOT EXISTS dictionaries;

CREATE TABLE IF NOT EXISTS dictionaries.status_dict (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20)
);

INSERT INTO dictionaries.status_dict (name, color) VALUES
    ('На проверке', 'orange'),
    ('Одобрено',    'green'),
    ('Отклонено',   'red'),
    ('В работе',    'blue')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS dictionaries.category_dict (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

INSERT INTO dictionaries.category_dict (name) VALUES
    ('Производство'),
    ('Логистика'),
    ('Качество'),
    ('Прочее')
ON CONFLICT DO NOTHING;

-- Main fact table (used as Superset dataset)
CREATE TABLE IF NOT EXISTS public.demo_data (
    id        SERIAL PRIMARY KEY,
    plant_id  VARCHAR(50),
    month     VARCHAR(20),
    qty       NUMERIC,
    revenue   NUMERIC
);

INSERT INTO public.demo_data (plant_id, month, qty, revenue) VALUES
    ('PLT-001', '2024-01', 150, 45000),
    ('PLT-001', '2024-02', 120, 36000),
    ('PLT-002', '2024-01', 200, 60000),
    ('PLT-002', '2024-02', 180, 54000),
    ('PLT-003', '2024-01',  90, 27000)
ON CONFLICT DO NOTHING;

-- Comments table (target for the comments feature)
CREATE TABLE IF NOT EXISTS public.demo_comments (
    id           SERIAL PRIMARY KEY,
    plant_id     VARCHAR(50),
    month        VARCHAR(20),
    comment_text TEXT,
    qty_value    NUMERIC,
    status_id    INTEGER,   -- FK -> dictionaries.status_dict.id
    category_id  INTEGER,   -- FK -> dictionaries.category_dict.id
    is_delete    BOOLEAN DEFAULT FALSE,
    created_by   VARCHAR(255),
    created_at   TIMESTAMP DEFAULT NOW()
);

-- Example: JOIN view for Superset dataset
-- CREATE OR REPLACE VIEW public.demo_data_with_comments AS
-- SELECT
--     d.plant_id,
--     d.month,
--     d.qty,
--     d.revenue,
--     c.comment_text,
--     c.qty_value,
--     s.name  AS status_name,
--     cat.name AS category_name
-- FROM public.demo_data d
-- LEFT JOIN LATERAL (
--     SELECT * FROM public.demo_comments dc
--     WHERE dc.plant_id = d.plant_id AND dc.month = d.month
--       AND dc.is_delete = FALSE
--     ORDER BY dc.created_at DESC LIMIT 1
-- ) c ON TRUE
-- LEFT JOIN dictionaries.status_dict   s   ON s.id   = c.status_id
-- LEFT JOIN dictionaries.category_dict cat ON cat.id = c.category_id;
