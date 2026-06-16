# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
Command for inserting/soft-deleting "comments" attached to ag-grid Table V2 charts.

Comments are stored as append-only rows in a user-configured target table (any
database connection already registered in Superset). A row is never updated or
hard-deleted: removing a comment is expressed as a new row with ``is_delete=True``.

The target table and column mapping live in the chart's ``form_data.comment_config``
(written by the frontend Control Panel). See ``deploy/AGENT2_TASK.md`` for the
full contract.
"""
from __future__ import annotations

from typing import Any

from flask import g
from sqlalchemy import MetaData, Table

from superset.commands.base import BaseCommand
from superset.commands.chart.exceptions import (
    ChartNotFoundError,
    CommentsConfigError,
    CommentsDatabaseNotFoundError,
    CommentsForbiddenError,
    CommentsValidationError,
)
from superset.daos.chart import ChartDAO
from superset.daos.database import DatabaseDAO
from superset.models.slice import Slice
from superset.utils import json

COMMENTS_PERMISSION_NAME = "can_write"
COMMENTS_VIEW_MENU_NAME = "Comments"


class InsertChartCommentsCommand(BaseCommand):
    """
    Validates and inserts a batch of comment records for a chart's configured
    target table.
    """

    def __init__(self, chart_id: int, records: list[dict[str, Any]]) -> None:
        self._chart_id = chart_id
        self._records = records
        self._chart: Slice | None = None
        self._config: dict[str, Any] | None = None

    def run(self) -> int:
        self.validate()
        return self._insert()

    def validate(self) -> None:
        chart = ChartDAO.find_by_id(self._chart_id)
        if not chart:
            raise ChartNotFoundError()
        self._chart = chart

        from superset import security_manager

        if not security_manager.can_access(
            COMMENTS_PERMISSION_NAME, COMMENTS_VIEW_MENU_NAME
        ):
            raise CommentsForbiddenError()

        try:
            form_data = json.loads(chart.params or "{}")
        except ValueError as ex:
            raise CommentsConfigError("Chart params are not valid JSON") from ex

        config = form_data.get("comment_config")
        if not config or not config.get("enabled"):
            raise CommentsConfigError(
                "Comments are not configured/enabled on this chart"
            )
        if not config.get("database_id") or not config.get("table"):
            raise CommentsConfigError("Comments config is missing database/table")
        if not config.get("key_mapping"):
            raise CommentsConfigError("Comments config is missing key_mapping")
        self._config = config

        if not self._records:
            raise CommentsValidationError("`records` must be a non-empty list")

        for record in self._records:
            self._validate_record(record)

    def _validate_record(self, record: dict[str, Any]) -> None:
        config = self._config
        assert config is not None

        keys = record.get("keys")
        if not keys or not isinstance(keys, dict):
            raise CommentsValidationError("Each record requires a `keys` object")

        for key_def in config["key_mapping"]:
            view_col = key_def["view_column"]
            if view_col not in keys:
                raise CommentsValidationError(f"Missing key value for `{view_col}`")

        fields = record.get("fields", {}) or {}
        if not isinstance(fields, dict):
            raise CommentsValidationError("`fields` must be an object")

        field_defs_by_target = {f["target_column"]: f for f in config.get("fields", [])}
        for target_col, value in fields.items():
            field_def = field_defs_by_target.get(target_col)
            if field_def is None:
                # Unknown target column — reject rather than silently inserting
                # into an unconfigured column.
                raise CommentsValidationError(
                    f"`{target_col}` is not a configured comment field"
                )
            self._validate_type(value, field_def)

    @staticmethod
    def _validate_type(value: Any, field_def: dict[str, Any]) -> None:
        field_type = field_def.get("type")
        target_col = field_def["target_column"]

        if value is None:
            return

        if field_type == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                try:
                    float(value)
                except (TypeError, ValueError) as ex:
                    raise CommentsValidationError(
                        f"`{target_col}` must be numeric"
                    ) from ex
        elif field_type == "dropdown_static":
            allowed = {opt.get("value") for opt in field_def.get("options", [])}
            if value not in allowed:
                raise CommentsValidationError(
                    f"`{value}` is not a valid option for `{target_col}`"
                )
        # `text` and `dropdown_dynamic` are not strictly type-checked server-side;
        # dropdown_dynamic options come from a live dataset query the backend does
        # not re-validate against (see AGENT2_TASK.md scope notes).

    def _insert(self) -> int:
        config = self._config
        assert config is not None

        database = DatabaseDAO.find_by_id(config["database_id"])
        if not database:
            raise CommentsDatabaseNotFoundError()

        schema = config.get("schema") or None
        table_name = config["table"]

        rows: list[dict[str, Any]] = []
        username = (
            g.user.username
            if getattr(g, "user", None) and not g.user.is_anonymous
            else None
        )
        for record in self._records:
            row: dict[str, Any] = {}
            for key_def in config["key_mapping"]:
                row[key_def["target_column"]] = record["keys"][key_def["view_column"]]
            for target_col, value in (record.get("fields") or {}).items():
                row[target_col] = value
            row["is_delete"] = bool(record.get("is_delete", False))
            row["created_by"] = username
            rows.append(row)

        with database.get_sqla_engine(schema=schema) as engine:
            metadata = MetaData()
            table = Table(
                table_name,
                metadata,
                schema=schema,
                autoload_with=engine,
            )
            with engine.begin() as conn:
                conn.execute(table.insert(), rows)

        return len(rows)
