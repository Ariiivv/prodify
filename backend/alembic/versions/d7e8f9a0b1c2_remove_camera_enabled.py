"""remove camera tracking from workspaces"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c4d9b6f1a2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("workspaces", "camera_enabled")


def downgrade() -> None:
    op.add_column("workspaces", sa.Column("camera_enabled", sa.Boolean(), nullable=False, server_default="false"))
