"""add parent child chunking tables

Revision ID: 67539b42dcdb
Revises: 162fa542daf9
Create Date: 2026-07-28 19:30:36.275304

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '67539b42dcdb'
down_revision: Union[str, Sequence[str], None] = '162fa542daf9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
