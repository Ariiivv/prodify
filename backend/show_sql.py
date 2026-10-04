import os
import sys

from alembic.config import Config
from alembic import command

# Point to the current directory
alembic_cfg = Config("alembic.ini")

def print_sql():
    # Use standard alembic command to output SQL
    command.upgrade(alembic_cfg, "head", sql=True)

if __name__ == "__main__":
    print_sql()
