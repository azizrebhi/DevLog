from app.celery import celery_app
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from docling.document_converter import DocumentConverter
import tiktoken
from openai import OpenAI
import os
import re
from app.model import Document, DOCUMENTSTATUS, DocumentChunk, DocumentParentChunk
import uuid

load_dotenv()
postgres_url = os.getenv("postgres_url")
sync_engine = create_engine(
    postgres_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
)
SyncSession = sessionmaker(sync_engine)
open_ai_key = os.getenv("OPEN_AI_KEY")
client = OpenAI(api_key=open_ai_key)


def split_markdown_into_parents(markdown: str) -> list[str]:
    """Splits full markdown document on Markdown headers (h1 to h3)."""
    sections = re.split(r"\n(?=#{1,3}\s)", markdown)
    return [s.strip() for s in sections if s.strip()]


def split_parent_into_children(text: str, target_chars: int = 1200, overlap: int = 150) -> list[str]:
    """Creates overlapping character-based child sliding window fragments."""
    out = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + target_chars, n)
        chunk = text[start:end].strip()
        if chunk:
            out.append(chunk)
        if end == n:
            break
        start = max(0, end - overlap)
    return out


@celery_app.task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3
)
def ingest_document(document_id: str):
    with SyncSession() as session:
        doc_uuid = uuid.UUID(document_id)

        # Loading document
        document = session.execute(
            select(Document).where(Document.id == doc_uuid)
        ).scalar_one_or_none()

        if document is None:
            # nothing to process
            return {"status": "not_found", "document_id": document_id}

        try:
            # pending -> processing
            document.status = DOCUMENTSTATUS.PROCESSING
            session.commit()
            
            # Docling parsing to export markdown string
            converter = DocumentConverter()
            doc = converter.convert(document.file_path).document
            
            # Save raw document parsed text to parent record
            document.parsed_markdown = doc.export_to_markdown()
            session.commit()
            
            # Initialize tiktoken tokenizer matching text-embedding-3-small (cl100k_base)
            tokenizer = tiktoken.get_encoding("cl100k_base")
            
            # Process parent structural chunks based on heading sections
            markdown_text = document.parsed_markdown or ""
            parents = split_markdown_into_parents(markdown_text)

            parent_rows = []
            for p_idx, p_text in enumerate(parents):
                p_tokens = len(tokenizer.encode(p_text))
                parent_rows.append(
                    DocumentParentChunk(
                        document_id=doc_uuid,
                        parent_index=p_idx,
                        content=p_text,
                        token_count=p_tokens,
                        page_start=None,
                        page_end=None,
                    )
                )

            session.add_all(parent_rows)
            session.flush()  # Flushes parent_rows to DB to generate parent primary keys (.id)

            child_rows = []
            child_idx = 0
            for p in parent_rows:
                children = split_parent_into_children(p.content, target_chars=1200, overlap=150)
                for child_text in children:
                    token_count = len(tokenizer.encode(child_text))
                    
                    response = client.embeddings.create(
                        model="text-embedding-3-small",
                        input=child_text,
                        dimensions=384
                    )
                    embedding = response.data[0].embedding

                    child_rows.append(
                        DocumentChunk(
                            document_id=doc_uuid,
                            parent_id=p.id, # Seamless hierarchical map link
                            chunk_index=child_idx,
                            content=child_text,
                            token_count=token_count,
                            page_start=None,
                            page_end=None,
                            embedding=embedding
                        )
                    )
                    child_idx += 1

            session.add_all(child_rows)
            document.status = DOCUMENTSTATUS.READY
            session.commit()
            return {"status": "ready", "document_id": document_id}

        except Exception as e:
            session.rollback()
            document = session.execute(
                select(Document).where(Document.id == doc_uuid)
            ).scalar_one_or_none()
            
            if document:
                document.status = DOCUMENTSTATUS.FAILED
                session.commit()
            
            raise e
