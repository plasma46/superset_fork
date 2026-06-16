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
Unit tests for InsertChartCommentsCommand (superset/commands/chart/comments.py).

These are pure unit tests: ChartDAO/DatabaseDAO/security_manager/SQLAlchemy
engine are mocked, so no DB connection or Flask app context is required.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from superset.commands.chart.comments import InsertChartCommentsCommand
from superset.commands.chart.exceptions import (
    ChartNotFoundError,
    CommentsConfigError,
    CommentsDatabaseNotFoundError,
    CommentsForbiddenError,
    CommentsValidationError,
)

VALID_CONFIG = {
    "enabled": True,
    "database_id": 1,
    "schema": "public",
    "table": "demo_comments",
    "key_mapping": [
        {"view_column": "plant_id", "target_column": "plant_id"},
        {"view_column": "month", "target_column": "month"},
    ],
    "fields": [
        {"view_column": "comment", "target_column": "comment_text", "type": "text"},
        {"view_column": "qty", "target_column": "qty_value", "type": "number"},
        {
            "view_column": "status",
            "target_column": "status_id",
            "type": "dropdown_static",
            "options": [{"label": "Open", "value": 1}, {"label": "Closed", "value": 2}],
        },
    ],
    "refresh_chart_id": 99,
}


def _make_chart(params: dict | None = None) -> MagicMock:
    chart = MagicMock()
    chart.id = 42
    chart.params = __import__("json").dumps(
        {"comment_config": params} if params is not None else {}
    )
    return chart


@pytest.fixture(autouse=True)
def mock_permission() -> MagicMock:
    """By default the user has the can_write/Comments permission."""
    with patch("superset.security_manager", new_callable=MagicMock) as mock_sm:
        mock_sm.can_access.return_value = True
        yield mock_sm


def test_chart_not_found() -> None:
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=None
    ):
        cmd = InsertChartCommentsCommand(42, [{"keys": {"plant_id": "A"}}])
        with pytest.raises(ChartNotFoundError):
            cmd.validate()


def test_forbidden_without_permission(mock_permission: MagicMock) -> None:
    mock_permission.can_access.return_value = False
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(
            42, [{"keys": {"plant_id": "A", "month": "2026-06"}}]
        )
        with pytest.raises(CommentsForbiddenError):
            cmd.validate()


def test_comments_not_configured() -> None:
    chart = _make_chart(None)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(42, [{"keys": {"plant_id": "A"}}])
        with pytest.raises(CommentsConfigError):
            cmd.validate()


def test_comments_disabled() -> None:
    config = {**VALID_CONFIG, "enabled": False}
    chart = _make_chart(config)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(42, [{"keys": {"plant_id": "A"}}])
        with pytest.raises(CommentsConfigError):
            cmd.validate()


def test_missing_key_value_raises() -> None:
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        # missing `month` key required by key_mapping
        cmd = InsertChartCommentsCommand(42, [{"keys": {"plant_id": "A"}}])
        with pytest.raises(CommentsValidationError):
            cmd.validate()


def test_unknown_target_field_rejected() -> None:
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(
            42,
            [
                {
                    "keys": {"plant_id": "A", "month": "2026-06"},
                    "fields": {"not_a_real_column": "x"},
                }
            ],
        )
        with pytest.raises(CommentsValidationError):
            cmd.validate()


@pytest.mark.parametrize("bad_value", ["abc", None, [], {}])
def test_numeric_field_rejects_non_numeric(bad_value: object) -> None:
    if bad_value is None:
        pytest.skip("None is allowed (treated as not-set)")
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(
            42,
            [
                {
                    "keys": {"plant_id": "A", "month": "2026-06"},
                    "fields": {"qty_value": bad_value},
                }
            ],
        )
        with pytest.raises(CommentsValidationError):
            cmd.validate()


def test_numeric_field_accepts_numeric_string() -> None:
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(
            42,
            [
                {
                    "keys": {"plant_id": "A", "month": "2026-06"},
                    "fields": {"qty_value": "15.5"},
                }
            ],
        )
        cmd.validate()  # should not raise


def test_dropdown_static_rejects_invalid_option() -> None:
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(
            42,
            [
                {
                    "keys": {"plant_id": "A", "month": "2026-06"},
                    "fields": {"status_id": 999},
                }
            ],
        )
        with pytest.raises(CommentsValidationError):
            cmd.validate()


def test_dropdown_static_accepts_valid_option() -> None:
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(
            42,
            [
                {
                    "keys": {"plant_id": "A", "month": "2026-06"},
                    "fields": {"status_id": 1},
                }
            ],
        )
        cmd.validate()  # should not raise


def test_database_not_found_on_insert() -> None:
    chart = _make_chart(VALID_CONFIG)
    with (
        patch(
            "superset.commands.chart.comments.ChartDAO.find_by_id",
            return_value=chart,
        ),
        patch(
            "superset.commands.chart.comments.DatabaseDAO.find_by_id",
            return_value=None,
        ),
    ):
        cmd = InsertChartCommentsCommand(
            42, [{"keys": {"plant_id": "A", "month": "2026-06"}}]
        )
        cmd.validate()
        with pytest.raises(CommentsDatabaseNotFoundError):
            cmd._insert()  # pylint: disable=protected-access


def test_insert_builds_expected_rows_and_executes() -> None:
    chart = _make_chart(VALID_CONFIG)

    mock_database = MagicMock()
    mock_engine = MagicMock()
    mock_database.get_sqla_engine.return_value.__enter__.return_value = mock_engine

    mock_conn = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn

    with (
        patch(
            "superset.commands.chart.comments.ChartDAO.find_by_id",
            return_value=chart,
        ),
        patch(
            "superset.commands.chart.comments.DatabaseDAO.find_by_id",
            return_value=mock_database,
        ),
        patch("superset.commands.chart.comments.Table") as mock_table_cls,
        patch("superset.commands.chart.comments.g") as mock_g,
    ):
        mock_g.user.username = "test_user"
        mock_g.user.is_anonymous = False
        mock_table = MagicMock()
        mock_table_cls.return_value = mock_table

        records = [
            {
                "keys": {"plant_id": "A-12", "month": "2026-06"},
                "fields": {"comment_text": "Проверено", "qty_value": 15.5},
                "is_delete": False,
            },
            {
                "keys": {"plant_id": "A-12", "month": "2026-06"},
                "fields": {},
                "is_delete": True,
            },
        ]
        cmd = InsertChartCommentsCommand(42, records)
        cmd.validate()
        inserted = cmd._insert()  # pylint: disable=protected-access

        assert inserted == 2
        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        rows = call_args[0][1]
        assert len(rows) == 2
        assert rows[0]["plant_id"] == "A-12"
        assert rows[0]["comment_text"] == "Проверено"
        assert rows[0]["is_delete"] is False
        assert rows[0]["created_by"] == "test_user"
        assert rows[1]["is_delete"] is True


def test_empty_records_rejected() -> None:
    chart = _make_chart(VALID_CONFIG)
    with patch(
        "superset.commands.chart.comments.ChartDAO.find_by_id", return_value=chart
    ):
        cmd = InsertChartCommentsCommand(42, [])
        with pytest.raises(CommentsValidationError):
            cmd.validate()
