"""add session distraction_count, distracted_seconds, timezone columns

Revision ID: b7e4f1a23c90
Revises: a93a32e84254
Create Date: 2026-10-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e4f1a23c90'
down_revision: Union[str, None] = 'a93a32e84254'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Part A Bug 1: current_goal was in schemas.py but missing from DB
    op.add_column('workspaces', sa.Column('current_goal', sa.String(), nullable=True))
    # Part A Bug 2: distraction_count was accepted by Pydantic but never persisted on sessions
    op.add_column('sessions', sa.Column('distraction_count', sa.Integer(), nullable=False, server_default='0'))
    # Part B: accumulated distracted seconds within a session for Deep Work Ratio calculation
    op.add_column('sessions', sa.Column('distracted_seconds', sa.Float(), nullable=False, server_default='0.0'))
    # Part C.4: IANA timezone string for correct calendar-day bucketing in user's local time
    op.add_column('sessions', sa.Column('timezone', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('sessions', 'timezone')
    op.drop_column('sessions', 'distracted_seconds')
    op.drop_column('sessions', 'distraction_count')
    op.drop_column('workspaces', 'current_goal')
