from fastapi import APIRouter, Depends, HTTPException ,UploadFile, File
from uuid import UUID
from sqlalchemy import select 
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_async_session
from app.utils import get_current_user
from app.model import Document 
from app.schema import DocumentStatusResponse



router = APIRouter(prefix="/documents", tags=["documents"])
@router.get("/{document_id}/status",status_code=200,response_model=DocumentStatusResponse)
async def get_document_status(
    document_id:UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user_id: str = Depends(get_current_user),
):
    result = await session.execute(select(Document).where(
        Document.id == document_id,
        Document.user_id==current_user_id           
        ))
    current_document = result.scalar_one_or_none()
    if not current_document :
        raise HTTPException(status_code=404, detail="document not found")
    return {"document_id":document_id,"status":current_document.status,"updated_at":current_document.updated_at}
    