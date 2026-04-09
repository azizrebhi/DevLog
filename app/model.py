from sqlalchemy import Column , String,Text ,DateTime , ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship,Mapped,mapped_column
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
from typing import List
class Base(DeclarativeBase):
    pass
class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False,index=True)
    password_hash=Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True),default=lambda: datetime.now(timezone.utc))
    sessions: Mapped[List["Session"]] = relationship(back_populates="user")

class Session(Base):
    __tablename__ = "sessions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    user : Mapped["User"] = relationship(back_populates="sessions")
    project: Mapped[str] = mapped_column(String(255), nullable=True)
    worked_on = Column(String(255))   
    duration = Column(String(255))
    what_learned = Column(String(255)) 
    blockers = Column(String(255))
    date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),index=True)
    updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=True
        )  



