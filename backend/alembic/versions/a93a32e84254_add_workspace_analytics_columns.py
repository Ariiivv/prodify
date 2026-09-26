"""add workspace analytics columns

Revision ID: a93a32e84254
Revises: 
Create Date: 2026-09-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a93a32e84254'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workspaces', sa.Column('daily_target_minutes', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('workspaces', sa.Column('current_streak', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('workspaces', sa.Column('longest_streak', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('workspaces', 'longest_streak')
    op.drop_column('workspaces', 'current_streak')
    op.drop_column('workspaces', 'daily_target_minutes')
