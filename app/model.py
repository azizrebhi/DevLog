from sqlalchemy import Enum as SAEnum,Column , String,Text ,DateTime , ForeignKey,UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, relationship,Mapped,mapped_column
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
from enum import StrEnum
from typing import List
class WorkspaceRole(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"
class MessageeRole(StrEnum):
    USER = "user"
    ASISSTANT = "assistant"
    SYSTEM = "system"
class JOBSTATUS(StrEnum):
    READY = "ready"
    PENDING = "pending"
    FAILED = "failed"
    PROCESSING="processing"

class Base(DeclarativeBase):
    pass
class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False,index=True)
    password_hash=Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True),default=lambda: datetime.now(timezone.utc))
class Workspace(Base):
    __tablename__ = "workspace"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    owner_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name=Column(String(255), unique=True, nullable=False,index=True)
    description=Column(String(255), unique=True, nullable=False,index=True)
    created_at = Column(DateTime(timezone=True),default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True),default=lambda: datetime.now(timezone.utc))
class Workspace_Member(Base) : 
    __tablename__ = "workspace_member"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    workspace_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id"), nullable=False
    )
    user_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        SAEnum(
            WorkspaceRole,
            name="workspace_role_enum",
            native_enum=True,        # PostgreSQL enum type
            validate_strings=True
        ),
        nullable=False,
        default=WorkspaceRole.VIEWER
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )
class Message(Base):
    __tablename__="message"
    id:Mapped[uuid.UUID]=mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    workspace_id=Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id"), nullable=False
    )
    role:Mapped[MessageeRole] = mapped_column(
        SAEnum(
            MessageeRole,
            name="message_role_enum",
            native_enum=True,        # PostgreSQL enum type
            validate_strings=True
        ),
        nullable=False, 
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class documents(Base):
     __tablename__="documents"
     id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
     user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
     workspace_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id"), nullable=False
    )
     source_type:Mapped[str] = mapped_column(String(255), nullable=False)
     status:Mapped[JOBSTATUS] = mapped_column(
        SAEnum(
            JOBSTATUS,
            name="job_status_enum",
            native_enum=True,        # PostgreSQL enum type
            validate_strings=True
        ),
        nullable=False, 
    )
     file_path : Mapped[str] = mapped_column(String(255), nullable=False)
     created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )
class document_chunks(Base):
    __tablename__="document_chunk"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False
    )
    
class MessageSource(Base):
    __tablename__ = "message_source"
    id:Mapped[uuid.UUID]=mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    message_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("message.id"), nullable=False
    )
    chunk_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_chunk.id"), nullable=False
    )
    citation_text: Mapped[str] = mapped_column(String(255), nullable=False)



