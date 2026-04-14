from fastapi import APIRouter, Depends, HTTPException ,Query
from uuid import UUID
from app.schema import SessionCreate ,SessionResponse , SessionsPage
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select ,desc ,cast, Integer
from app.db import get_async_session
from app.model import Session
from datetime import datetime, timezone
from app.utils import get_current_user
from typing import Optional
router=APIRouter(prefix="/sessions",tags=["sessions"])
@router.post("/", response_model=SessionResponse)
async def create_session(
    data: SessionCreate,
    current_user_id: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    new_session = Session(
        project=data.project,
        user_id=current_user_id,
        worked_on=data.worked_on,
        duration=data.duration,
        what_learned=data.what_learned,
        blockers=data.blockers,
    )
    session.add(new_session)
    await session.commit()
    await session.refresh(new_session)
    return new_session


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    current_user_id: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    result = await session.execute(
        select(Session).where(Session.id == session_id,
                              Session.user_id==current_user_id)
    )
    dev_session = result.scalar_one_or_none()
    if dev_session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return dev_session


@router.get("/",response_model=SessionsPage)
async def get_sessions (
    session: AsyncSession = Depends(get_async_session),
    current_user_id: str = Depends(get_current_user),
    project: Optional[str] = None,
    duration_min: Optional[int] = None,
    duration_max: Optional[int] = None,
    limit: int = Query(default=10, ge=1, le=50),
    cursor: Optional[UUID] = None
    ):
    query =select(Session).where(Session.user_id==current_user_id)
    if project :
       query = query.where(Session.project.ilike(f"%{project}%"))
    if duration_min :
        query=query.where(cast(Session.duration,Integer) >=duration_min)
    if duration_max is not None:
        query = query.where(cast(Session.duration, Integer )<= duration_max)
    if cursor:
       cursor_session = await session.get(Session, cursor)
       if cursor_session is None:
          raise HTTPException(status_code=400, detail="Invalid cursor")
       query = query.where(Session.date < cursor_session.date)
    query = query.order_by(desc(Session.date)).limit(limit + 1)

    result = await session.execute(
        query
       )
    
    sessions = result.scalars().all()
    has_more = len(sessions) > limit
    items = sessions[:limit]
    next_cursor = items[-1].id if has_more else None
    return SessionsPage(
    items=sessions[:limit],
    next_cursor=next_cursor,
    has_more=has_more
   )


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: UUID,
    current_user_id: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    result = await session.execute(
        select(Session).where(Session.id == session_id,
        Session.user_id==current_user_id)
    )
    dev_session = result.scalar_one_or_none()
    if dev_session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    await session.delete(dev_session)
    await session.commit()


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: UUID,
    data: SessionCreate,
    current_user_id: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    result = await session.execute(
        select(Session).where(Session.id == session_id),
        Session.user_id==current_user_id
    )
    dev_session = result.scalar_one_or_none()
    if dev_session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    dev_session.worked_on = data.worked_on
    dev_session.duration = data.duration
    dev_session.what_learned = data.what_learned
    dev_session.blockers = data.blockers
    dev_session.updated_at = datetime.now(timezone.utc)


    await session.commit()
    await session.refresh(dev_session)
    return dev_session
