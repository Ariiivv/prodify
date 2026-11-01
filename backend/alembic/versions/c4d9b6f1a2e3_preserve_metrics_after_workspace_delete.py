"""allow workspace metrics to survive workspace deletion

Revision ID: c4d9b6f1a2e3
Revises: f2a01e46c2de
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d9b6f1a2e3"
down_revision: Union[str, None] = "f2a01e46c2de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # New SQLite databases are created from the updated ORM metadata. The
        # deployed Supabase database is PostgreSQL and is handled below.
        return

    op.execute(
        "ALTER TABLE workspace_metrics ALTER COLUMN workspace_id DROP NOT NULL"
    )
    op.execute(
        """
        DO $$
        DECLARE fk_name text;
        BEGIN
            SELECT tc.constraint_name INTO fk_name
            FROM information_schema.table_constraints tc
            WHERE tc.table_schema = current_schema()
              AND tc.table_name = 'workspace_metrics'
              AND tc.constraint_type = 'FOREIGN KEY';
            IF fk_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE workspace_metrics DROP CONSTRAINT %I', fk_name);
            END IF;
        END $$;
        """
    )
    op.create_foreign_key(
        "fk_workspace_metrics_workspace_id",
        "workspace_metrics",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.drop_constraint(
        "fk_workspace_metrics_workspace_id",
        "workspace_metrics",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_workspace_metrics_workspace_id",
        "workspace_metrics",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute(
        "ALTER TABLE workspace_metrics ALTER COLUMN workspace_id SET NOT NULL"
    )
