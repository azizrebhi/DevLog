from fastapi import APIRouter, Depends, HTTPException ,UploadFile, File
from app.schema import WorkspaceResponse , DocumentResponse
from uuid import UUID,uuid4
from sqlalchemy import select 
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_async_session
from app.utils import get_current_user
from app.model import Workspace,Document , DOCUMENTSTATUS
from typing import Annotated

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
@router.post("/", response_model=WorkspaceResponse)
async def create_workspace ( session: AsyncSession = Depends(get_async_session),
                    current_user_id: str = Depends(get_current_user)):
    new_workspace = Workspace(name="Untitled Notebook",owner_id=current_user_id)
    session.add(new_workspace)
    await session.commit()
    await session.refresh(new_workspace)
    return new_workspace
@router.post("/{workspace_id}/documents", response_model=list[DocumentResponse],status_code=201)
async def upload_Documents(
    workspace_id:UUID,
    files: list[UploadFile]=File(...),
    session: AsyncSession = Depends(get_async_session),
    current_user_id: str = Depends(get_current_user), 
):
    result = await session.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.owner_id == current_user_id,
        )
    )
    workspace = result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    upload_dir = Path("uploads") / str(workspace_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    created_docs: list[Document] = []

    for file in files:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Invalid file name")

        ext = Path(file.filename).suffix.lower()
        if ext not in {".pdf", ".docx", ".txt", ".md",".pptx"}:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

        stored_name = f"{uuid4()}{ext}"
        save_path = upload_dir / stored_name

        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)

        doc = Document(
            title=file.filename,
            user_id=current_user_id,
            workspace_id=workspace_id,
            source_type=ext.lstrip("."),
            status=DOCUMENTSTATUS.PENDING,
            file_path=str(save_path),
        )
        session.add(doc)
        created_docs.append(doc)

    await session.commit()
    from app.tasks import ingest_document

    for doc in created_docs:
        await session.refresh(doc)
        ingest_document.delay(str(doc.id))

    return created_docs

    






