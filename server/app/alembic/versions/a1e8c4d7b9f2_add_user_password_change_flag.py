"""add user password change flag

Revision ID: a1e8c4d7b9f2
Revises: 6c499779c649
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1e8c4d7b9f2"
down_revision: Union[str, Sequence[str], None] = "6c499779c649"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("user", "must_change_password")
