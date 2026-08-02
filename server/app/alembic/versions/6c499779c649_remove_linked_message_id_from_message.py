"""remove linked_message_id from message

Revision ID: 6c499779c649
Revises: 39d8921c6309
Create Date: 2026-08-02 22:18:02.065565

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '6c499779c649'
down_revision: Union[str, Sequence[str], None] = '39d8921c6309'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('message_ibfk_2', 'message', type_='foreignkey')
    op.drop_column('message', 'linked_message_id')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('message', sa.Column('linked_message_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'message_ibfk_2', 'message', 'message',
        ['linked_message_id'], ['id'], ondelete='SET NULL',
    )
