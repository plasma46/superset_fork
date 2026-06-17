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
Command for fetching dropdown options for a dropdown_dynamic comment field.
Options are fetched directly from the configured database (not via a Superset dataset).
"""
from __future__ import annotations

from typing import Any

import sqlalchemy as sa

from superset.commands.base import BaseCommand
from superset.commands.chart.exceptions import (
    ChartNotFoundError,
    CommentsConfigError,
    CommentsDatabaseNotFoundError,
    CommentsForbiddenError,
)
from superset.commands.chart.comments import COMMENTS_PERMISSION_NAME, COMMENTS_VIEW_MENU_NAME
from superset.daos.chart import ChartDAO
from superset.daos.database import DatabaseDAO
from superset.utils import json


class GetCommentOptionsCommand(BaseCommand):
    """
    Returns [{value, label}] for a dropdown_dynamic comment field by querying
    the options_table directly via the field's (or fallback comment_config's) database.
    """

    def __init__(self, chart_id: int, target_column: str) -> None:
        self._chart_id = chart_id
        self._target_column = target_column

    def run(self) -> list[dict[str, Any]]:
        self.validate()
        return self._fetch()

    def validate(self) -> None:
        chart = ChartDAO.find_by_id(self._chart_id)
        if not chart:
            raise ChartNotFoundError()

        from superset import security_manager
        if not security_manager.can_access(COMMENTS_PERMISSION_NAME, COMMENTS_VIEW_MENU_NAME):
            raise CommentsForbiddenError()

        try:
            form_data = json.loads(chart.params or "{}")
        except ValueError as ex:
            raise CommentsConfigError("Chart params are not valid JSON") from ex

        config = form_data.get("comment_config")
        if not config or not config.get("enabled"):
            raise CommentsConfigError("Comments are not configured/enabled on this chart")

        fields = config.get("fields") or []
        field_def = next(
            (f for f in fields if f.get("target_column") == self._target_column), None
        )
        if not field_def:
            raise CommentsConfigError(
                f"No field with target_column='{self._target_column}' found in comment_config"
            )
        if field_def.get("type") != "dropdown_dynamic":
            raise CommentsConfigError(
                f"Field '{self._target_column}' is not of type dropdown_dynamic"
            )

        options_table = field_def.get("options_table")
        options_value_column = field_def.get("options_value_column")
        options_label_column = field_def.get("options_label_column")
        if not options_table or not options_value_column:
            raise CommentsConfigError(
                f"Field '{self._target_column}' is missing options_table or options_value_column"
            )

        # Resolve database: field-level override first, then comment_config fallback
        database_id = field_def.get("options_database_id") or config.get("database_id")
        if not database_id:
            raise CommentsConfigError("No database_id configured for dynamic options")

        database = DatabaseDAO.find_by_id(database_id)
        if not database:
            raise CommentsDatabaseNotFoundError()

        self._database = database
        self._schema = field_def.get("options_schema") or config.get("schema") or None
        self._table = options_table
        self._value_col = options_value_column
        self._label_col = options_label_column or options_value_column

    def _fetch(self) -> list[dict[str, Any]]:
        with self._database.get_sqla_engine(schema=self._schema) as engine:
            meta = sa.MetaData()
            tbl = sa.Table(
                self._table,
                meta,
                schema=self._schema,
                autoload_with=engine,
            )
            value_col = tbl.c[self._value_col]
            label_col = tbl.c[self._label_col]
            with engine.connect() as conn:
                rows = conn.execute(
                    sa.select(value_col, label_col).order_by(label_col)
                ).fetchall()

        return [{"value": row[0], "label": str(row[1])} for row in rows]
