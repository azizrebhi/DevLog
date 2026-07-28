from pydantic import BaseModel , EmailStr , ConfigDict,Field
from datetime import datetime
from uuid import UUID

class UserCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    email:EmailStr
    password:str = Field(min_length=8)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:UUID
    email:EmailStr
    created_at:datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:UUID
    name:str
    summary:str | None
    created_at:datetime

class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:UUID 
    title:str
    workspace_id:UUID
    status:str
    created_at:datetime
    updated_at: datetime

class DocumentStatusResponse(BaseModel):
    document_id:UUID
    status:str
    updated_at: datetime

class RetrieveRequest(BaseModel):
    query: str = Field(min_length=2)
    limit: int = Field(default=5, ge=1, le=20)
    document_ids: list[UUID] | None = None

class RetrievedChunk(BaseModel):
    document_id: UUID
    chunk_index: int
    content: str

class RetrieveResponse(BaseModel):
    query: str
    results: list[RetrievedChunk]
    
class AnswerCitation(BaseModel):
    source_id:str
    document_id:UUID
    chunk_index:int
    content:str

class AnswerResponse(BaseModel):
    query: str
    answer: str
    citations:list[AnswerCitation]









