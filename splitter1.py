import argparse
import asyncio
import os
import uuid

from dotenv import load_dotenv
from openai import AsyncOpenAI
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.model import Document, DocumentChunk, DocumentParentChunk, DOCUMENTSTATUS
from splitter import split_document
from ingest_parent_chunks import ingest_parent_chunks
from ingest_question_chunk import ingest_question_chunks

load_dotenv()

POSTGRES_URL = os.getenv("postgres_url")
OPEN_AI_KEY = os.getenv("OPEN_AI_KEY")

openai_client = AsyncOpenAI(api_key=OPEN_AI_KEY)

async_engine = create_async_engine(POSTGRES_URL, echo=False)

AsyncSessionPool = sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def import_exam(md_path: str, title: str, workspace_id: uuid.UUID, user_id: uuid.UUID):
    with open(md_path, encoding="utf-8") as f:
        markdown = f.read()

    async with AsyncSessionPool() as session:
        async with session.begin():

            doc_uuid = uuid.uuid4()

            document = Document(
                id=doc_uuid,
                title=title,
                user_id=user_id,
                workspace_id=workspace_id,
                source_type="pdf",
                status=DOCUMENTSTATUS.PROCESSING,
                file_path=md_path,
                parsed_markdown=markdown,
            )
            session.add(document)
            await session.flush()
            print(f"Created Document id={doc_uuid}")

            # Step 1: pure Python split, sanity-check before touching the DB further
            paired, unmatched = split_document(markdown)
            print(f"Split into {len(paired)} sections, {len(unmatched)} unmatched corrigé fragments")

            # Step 2: persist parent chunks (Exercice / Problème / Partie 1-4)
            parent_results = await ingest_parent_chunks(session, doc_uuid, markdown)
            print(f"Inserted {len(parent_results)} DocumentParentChunk rows")

            # Step 3: LLM extraction -> individual DocumentChunk rows (question/answer)
            failed_parents = await ingest_question_chunks(session, openai_client, doc_uuid, parent_results)

            if failed_parents:
                document.status = DOCUMENTSTATUS.FAILED
                await session.flush()
                await session.commit()
                print("\n========================================")
                print("INGESTION INCOMPLETE — document marked FAILED")
                print("========================================")
                print(f"Document ID     : {doc_uuid}")
                print(f"Failed sections : {failed_parents}")
                print("Fix the underlying issue (timeout, API error, etc.) and rerun.")
                print("The document will NOT be shown to students in this state.")
                print("========================================")
                return

            document.status = DOCUMENTSTATUS.READY
            await session.flush()

        await session.commit()

    print("\n========================================")
    print("INGESTION SUCCESS")
    print("========================================")
    print(f"Document ID : {doc_uuid}")
    print("Status      : READY")
    print("========================================")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("md_path", help="Path to the docling-extracted .md file")
    parser.add_argument("--title", required=True, help='e.g. "2020 Mathématiques I"')
    parser.add_argument("--workspace-id", required=True, type=uuid.UUID)
    parser.add_argument("--user-id", required=True, type=uuid.UUID)
    args = parser.parse_args()

    asyncio.run(import_exam(args.md_path, args.title, args.workspace_id, args.user_id))


if __name__ == "__main__":
    main()