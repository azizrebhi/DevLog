from sqlalchemy.ext.asyncio import AsyncSession
from app.model import Workspace, WorkspaceMember, DocumentChunk, Document, DocumentParentChunk
from app.schema import RetrieveResponse, RetrieveRequest, RetrievedChunk 
from sqlalchemy import select, func, or_
from fastapi import HTTPException
from uuid import UUID
from openai import AsyncOpenAI
import logging
import time
import os

open_ai_key = os.getenv("OPEN_AI_KEY")
client = AsyncOpenAI(api_key=open_ai_key)


async def hybrid_retrieve_chunks(
    workspace_id: UUID, 
    payload: RetrieveRequest,
    session: AsyncSession,
    current_user_id: str
):
    # 1. Workspace access security validation
    owner_ws = (await session.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.owner_id == current_user_id
        )
    )).scalar_one_or_none()
    
    member_ws = (await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user_id
        )
    )).scalar_one_or_none()
    
    if owner_ws is None and member_ws is None: 
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # 2. Build dynamic filters once based on workspace and optional target documents
    filters = [Document.workspace_id == workspace_id]
    if hasattr(payload, "document_ids") and payload.document_ids:
        filters.append(Document.id.in_(payload.document_ids))
    
    # --- 3. Lexical Search Block (Full-Text) ---
    ts_query = func.websearch_to_tsquery("english", payload.query)
    ts_vector = func.to_tsvector("english", DocumentChunk.content)
    lex_rank = func.ts_rank(ts_vector, ts_query)
    
    lexical_stmt = (
        select(
            DocumentChunk.id,
            DocumentChunk.document_id,
            DocumentChunk.parent_id,
            DocumentChunk.chunk_index,
            DocumentChunk.content,
            lex_rank.label("lex_rank"),
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            *filters,
            ts_vector.op("@@")(ts_query),
        )
        .order_by(lex_rank.desc())
        .limit(20)
    )
    lexical_rows = (await session.execute(lexical_stmt)).all()
    
    # --- 4. Semantic Search Block (Vector Embeddings) ---
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=payload.query,
        dimensions=384 
    )
    query_embedding = response.data[0].embedding
    sem_distance = DocumentChunk.embedding.cosine_distance(query_embedding)

    semantic_stmt = (
        select(
            DocumentChunk.id,
            DocumentChunk.document_id,
            DocumentChunk.parent_id,
            DocumentChunk.chunk_index,
            DocumentChunk.content,
            sem_distance.label("distance"),
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            *filters,
            DocumentChunk.embedding.is_not(None),
        )
        .order_by(sem_distance.asc())
        .limit(20)
    )
    semantic_rows = (await session.execute(semantic_stmt)).all()
    
    # --- 5. Reciprocal Rank Fusion (RRF) ---
    RRF_K = 60
    fused: dict[str, dict] = {}

    for rank, r in enumerate(lexical_rows, start=1):
        key = str(r.id)
        if key not in fused:
            fused[key] = {
                "document_id": r.document_id,
                "parent_id": r.parent_id,
                "chunk_index": r.chunk_index,
                "content": r.content,
                "score": 0.0,
            }
        fused[key]["score"] += 1.0 / (RRF_K + rank)

    for rank, r in enumerate(semantic_rows, start=1):
        key = str(r.id)
        if key not in fused:
            fused[key] = {
                "document_id": r.document_id,
                "parent_id": r.parent_id,  # Fixed: Restored missing parent tracking column parameter
                "chunk_index": r.chunk_index,
                "content": r.content,
                "score": 0.0,
            }
        fused[key]["score"] += 1.0 / (RRF_K + rank)
        
    # Get top 20 fused candidates
    top = sorted(fused.values(), key=lambda x: x["score"], reverse=True)[:20]
    
    # --- 6. Parent Hierarchical Map Expansion Block ---
    parent_ids = list({item["parent_id"] for item in top if item.get("parent_id") is not None})

    parent_map = {}
    if parent_ids:
        parent_rows = (await session.execute(
            select(DocumentParentChunk.id, DocumentParentChunk.content)
            .where(DocumentParentChunk.id.in_(parent_ids))
        )).all()
        parent_map = {row.id: row.content for row in parent_rows}

    # Deduplicate matching pages/parents cleanly
    seen_parents = set()
    results = []
    
    for item in top:
        pid = item.get("parent_id")
        if pid is not None:
            if pid in seen_parents:
                continue
            seen_parents.add(pid)

        # Swaps tiny child text string with the macro parental chunk content
        expanded_content = parent_map.get(pid, item["content"])
        results.append(
            RetrievedChunk(
                document_id=item["document_id"],
                chunk_index=item["chunk_index"],
                content=expanded_content,
            )
        )
    
    return RetrieveResponse(query=payload.query, results=results)
