from fastapi import APIRouter, Depends, HTTPException ,Query
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from typing import List
from app.utils import get_current_user 
from app.db import get_async_session
from app.model import WeeklySummary , Session
from app.schema import SummaryResponse
from app.summary import calculate_summary
from sqlalchemy import select,desc 
router=APIRouter(prefix="/summary",tags=["summaries"])
@router.get("/", response_model=List[SummaryResponse])
async def get_summaries(
    current_user_id: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    query =select(WeeklySummary).where(WeeklySummary.user_id==current_user_id).order_by(desc(WeeklySummary.created_at))
    result = await session.execute(
        query
       )
    summaries = result.scalars().all()
    return summaries
@router.get("/latest", response_model=SummaryResponse)
async def get_summaries(
    current_user_id: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    query =select(WeeklySummary).where(WeeklySummary.user_id==current_user_id).order_by(desc(WeeklySummary.created_at)).limit(1)
    result = await session.execute(
        query
       )
    summary = result.scalar_one()
    if summary is None :
        raise HTTPException(
            status_code=404,
            detail="No summaries available"
        )
    return summary

from app.tasks import generate_weekly_summaries

@router.post("/trigger")
async def trigger_summary(
    current_user_id: str = Depends(get_current_user)
):
    generate_weekly_summaries.delay()
    return {"message": "Summary generation started. Check /summary/latest in a few seconds."}


