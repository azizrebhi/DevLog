from sqlalchemy import Enum as SAEnum,Column,Integer ,Float,Text, String ,DateTime , ForeignKey,UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, relationship,Mapped,mapped_column
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
from enum import StrEnum
#from typing import List
class WorkspaceRole(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"
class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
class DOCUMENTSTATUS(StrEnum):
    READY = "ready"
    PENDING = "pending"
    FAILED = "failed"
    PROCESSING="processing"

class Base(DeclarativeBase):
    pass
class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at :Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
class Workspace(Base):
    __tablename__ = "workspace"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    owner_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    summary:Mapped[str]=mapped_column(Text,nullable=True,index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False)
class WorkspaceMember(Base) : 
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
    workspace_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id"), nullable=False
    )
    role:Mapped[MessageRole] = mapped_column(
        SAEnum(
            MessageRole,
            name="message_role_enum",
            native_enum=True,        # PostgreSQL enum type
            validate_strings=True
        ),
        nullable=False, 
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False)


class Document(Base):
     __tablename__="documents"
     id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
     title: Mapped[str] = mapped_column(String, nullable=False)
     user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
     workspace_id:Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id"), nullable=False
    )
     source_type:Mapped[str] = mapped_column(String(255), nullable=False)
     status: Mapped[DOCUMENTSTATUS] = mapped_column(
    SAEnum(
        DOCUMENTSTATUS,
        name="document_status_enum",
        native_enum=True,  # PostgreSQL enum type
        validate_strings=True,
    ),
    default=DOCUMENTSTATUS.PENDING,  # Sets the default value
    nullable=False,)
     file_path : Mapped[str] = mapped_column(String(255), nullable=False)
     created_at:Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
     updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False)
class DocumentChunk(Base):
    __tablename__="document_chunk"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
     )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False
    )
    chunk_index:Mapped[int] = mapped_column( nullable=False)
    content:Mapped[Text] = mapped_column(Text, nullable=False)
    token_count:Mapped[int] = mapped_column( Integer ,nullable=True)
    page_start:Mapped[int] = mapped_column(Integer, nullable=True)
    page_end:Mapped[int] = mapped_column(Integer, nullable=True)
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_document_chunk"),
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
    score:Mapped[float] =mapped_column(Float,nullable=False )
    citation_text: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at :Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    __table_args__=(UniqueConstraint("message_id","chunk_id",name="uq_message_chunk"),)



