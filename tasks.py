import os
import json
import uuid
import asyncio
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import delete

from app.model import (
    Document,
    DocumentParentChunk,
    DocumentChunk,
    DOCUMENTSTATUS,
)

load_dotenv()

POSTGRES_URL = os.getenv("postgres_url")
OPEN_AI_KEY = os.getenv("OPEN_AI_KEY")

openai_client = AsyncOpenAI(api_key=OPEN_AI_KEY)

async_engine = create_async_engine(
    POSTGRES_URL,
    echo=False,
)

AsyncSessionPool = sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

WS_ID = uuid.UUID("9cfc2fbb-b334-44fc-88cf-3f3537d088d5")
USER_ID = uuid.UUID("3eaa6bc8-b637-456d-8243-17307f211071")

BASE_DIR = Path(__file__).resolve().parent
JSON_PATH = Path("/mnt/c/Users/maison info/Downloads/concours_2020_math1_curated.json")


async def get_embedding_vector(text: str) -> list[float]:
    response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
        dimensions=384,
    )
    return response.data[0].embedding


async def import_exam():
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    exam = data["exam"]
    parents = data["parents"]
    questions = data["questions"]

    # Hard safety gate.
    # Never put a partially aligned exam into READY.
    missing = [
        q["question_id"]
        for q in questions
        if not q.get("statement") or not q.get("correction")
    ]

    if missing:
        raise RuntimeError(
            f"ABORTED: {len(missing)} question/correction pairs are incomplete. "
            f"First IDs: {missing[:10]}"
        )

    doc_uuid = uuid.uuid5(
        uuid.NAMESPACE_DNS,
        f"concours-{exam['year']}-{exam['subject'].lower().replace(' ', '')}",
    )

    async with AsyncSessionPool() as session:
        async with session.begin():

            # Idempotent re-import: remove the previous version first.
            existing = await session.get(Document, doc_uuid)

            if existing:
                print(f"Purging existing document: {doc_uuid}")

                await session.execute(
                    delete(DocumentChunk).where(
                        DocumentChunk.document_id == doc_uuid
                    )
                )

                await session.execute(
                    delete(DocumentParentChunk).where(
                        DocumentParentChunk.document_id == doc_uuid
                    )
                )

                await session.delete(existing)
                await session.flush()

            document = Document(
                id=doc_uuid,
                title=f"{exam['year']} {exam['subject']}",
                user_id=USER_ID,
                workspace_id=WS_ID,
                source_type="curated_json",
                status=DOCUMENTSTATUS.PROCESSING,
                file_path=exam["source_file"],
                parsed_markdown="Curated from Docling extracted Markdown",
            )

            session.add(document)
            await session.flush()

            parent_db_ids = {}

            # ---------------------------------------------------------
            # 1. Create parent chunks
            # ---------------------------------------------------------
            for parent in parents:
                parent_uuid = uuid.uuid4()
                parent_db_ids[parent["parent_id"]] = parent_uuid

                parent_questions = [
                    q for q in questions
                    if q["parent_id"] == parent["parent_id"]
                ]

                parent_content = "\n\n".join(
                    q["statement"] for q in parent_questions
                )

                db_parent = DocumentParentChunk(
                    id=parent_uuid,
                    document_id=doc_uuid,
                    parent_index=parent["parent_index"],
                    content=parent_content,
                    token_count=max(1, len(parent_content) // 4),
                )

                session.add(db_parent)

            await session.flush()

            # ---------------------------------------------------------
            # 2. Create question/correction chunks
            # ---------------------------------------------------------
            for global_index, q in enumerate(questions, start=1):

                print(
                    f"[{global_index}/{len(questions)}] "
                    f"Embedding {q['question_id']} ({q['label']})..."
                )

                contextual_payload = (
                    f"Concours {exam['year']} — {exam['subject']}\n"
                    f"Section: {q['section'] if 'section' in q else q['parent_id']}\n"
                    f"Question: {q['label']}\n\n"
                    f"{q['statement']}"
                )

                vector = await get_embedding_vector(contextual_payload)

                # Keep your existing unified payload for retrieval.
                unified_content = (
                    f"### QUESTION\n"
                    f"{q['statement']}\n\n"
                    f"### CORRECTION\n"
                    f"{q['correction']}"
                )

                db_child = DocumentChunk(
                    id=uuid.uuid4(),
                    document_id=doc_uuid,
                    parent_id=parent_db_ids[q["parent_id"]],
                    chunk_index=global_index,
                    content=unified_content,
                    token_count=max(1, len(unified_content) // 4),
                    embedding=vector,
                )

                session.add(db_child)

                # Commit periodically so a long embedding run does not
                # hold one enormous transaction in memory.
                if global_index % 10 == 0:
                    await session.flush()

            document.status = DOCUMENTSTATUS.READY
            await session.flush()

        await session.commit()

    print("\n========================================")
    print("IMPORT SUCCESS")
    print("========================================")
    print(f"Document ID : {doc_uuid}")
    print(f"Questions   : {len(questions)}")
    print("Status      : READY")
    print("========================================")


if __name__ == "__main__":
    asyncio.run(import_exam())