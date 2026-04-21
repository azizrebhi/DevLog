from pydantic import BaseModel , EmailStr , ConfigDict,Field
from datetime import datetime
from uuid import UUID

class UserCreate(BaseModel):
    email:EmailStr
    password:str = Field(min_length=8)

class UserResponse(BaseModel):
    id:UUID
    email:EmailStr
    created_at:datetime
class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id : UUID
    user_id: UUID
    project:str
    worked_on :str   
    duration : str
    what_learned : str 
    blockers : str
    date : datetime
    updated_at: datetime | None
class SessionCreate(BaseModel):
    project:str
    worked_on : str   
    duration : str
    what_learned : str 
    blockers : str
class SessionUpdate(BaseModel):
    project: str | None = None
    worked_on: str | None = None
    duration: str | None = None
    what_learned: str | None = None
    blockers: str | None = None
class SessionsPage(BaseModel):
    items: list[SessionResponse]
    next_cursor: UUID | None
    has_more: bool
class SummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id : UUID
    user_id: UUID
    week_start : datetime
    total_sessions : int
    total_minutes : int 
    top_project : str | None
    most_common_blocker : str | None
    created_at: datetime

