from app.celery import celery_app
from sqlalchemy import create_engine, select, delete
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from docling.document_converter import DocumentConverter
import tiktoken
from openai import OpenAI
import os
import re
import uuid
from datetime import datetime, timezone
from app.model import Document, DOCUMENTSTATUS, DocumentChunk, DocumentParentChunk

load_dotenv()
postgres_url = os.getenv("postgres_url")
sync_engine = create_engine(
    postgres_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
)
SyncSession = sessionmaker(sync_engine)
open_ai_key = os.getenv("OPEN_AI_KEY")
client = OpenAI(api_key=open_ai_key)

# Global configuration variables for tracing and lineage (Points 11 & 12)
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 384
PIPELINE_VERSION = "v2.0"


def create_token_aware_parents(doc_elements, tokenizer, target_tokens: int = 1000) -> list[dict]:
    """
    Builds parent blocks by accumulating Docling structural elements.
    Ensures long sections without headers break naturally down at paragraph structures. (Points 2 & 10)
    """
    parents = []
    current_elements = []
    current_tokens = 0
    parent_index = 0

    for element in doc_elements:
        text = element.text.strip() if hasattr(element, "text") else ""
        if not text:
            continue
            
        # Extract page metadata natively exposed by Docling layout tree (Point 4)
        page_num = None
        if hasattr(element, "prov") and element.prov:
            page_num = element.prov[0].page_no

        element_tokens = len(tokenizer.encode(text))

        # Check structural splitting boundary triggers
        is_header = hasattr(element, "label") and "heading" in str(element.label).lower()
        exceeds_size = (current_tokens + element_tokens) > target_tokens

        if (is_header or exceeds_size) and current_elements:
            # Package accumulated elements into a complete parent row
            combined_text = "\n\n".join([el["text"] for el in current_elements])
            pages = [el["page"] for el in current_elements if el["page"] is not None]
            
            parents.append({
                "parent_index": parent_index,
                "content": combined_text,
                "token_count": current_tokens,
                "page_start": min(pages) if pages else None,
                "page_end": max(pages) if pages else None
            })
            parent_index += 1
            current_elements = []
            current_tokens = 0

        current_elements.append({"text": text, "page": page_num})
        current_tokens += element_tokens

    # Flush final lingering elements
    if current_elements:
        combined_text = "\n\n".join([el["text"] for el in current_elements])
        pages = [el["page"] for el in current_elements if el["page"] is not None]
        parents.append({
            "parent_index": parent_index,
            "content": combined_text,
            "token_count": current_tokens,
            "page_start": min(pages) if pages else None,
            "page_end": max(pages) if pages else None
        })

    return parents


def split_parent_into_semantic_children(parent_text: str, tokenizer, target_tokens: int = 300, overlap_tokens: int = 50) -> list[str]:
    """
    Splits parent context blocks down into overlap-protected child text chunks.
    Replaces character-based logic with token constraints. (Points 1 & 3)
    """
    paragraphs = [p.strip() for p in parent_text.split("\n\n") if p.strip()]
    chunks = []
    current_chunk_tokens = []
    current_chunk_text = []

    for para in paragraphs:
        para_tokens = tokenizer.encode(para)
        
        # If a single paragraph is longer than target, break it by sentences
        if len(para_tokens) > target_tokens:
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sentence in sentences:
                sent_tokens = tokenizer.encode(sentence)
                if len(current_chunk_tokens) + len(sent_tokens) > target_tokens:
                    if current_chunk_text:
                        chunks.append(" ".join(current_chunk_text))
                    # Handle sliding overlap using past processed tokens
                    current_chunk_tokens = current_chunk_tokens[-overlap_tokens:] if overlap_tokens > 0 else []
                    current_chunk_text = [tokenizer.decode(current_chunk_tokens)] if current_chunk_tokens else []
                
                current_chunk_tokens.extend(sent_tokens)
                current_chunk_text.append(sentence)
        else:
            if len(current_chunk_tokens) + len(para_tokens) > target_tokens:
                if current_chunk_text:
                    chunks.append("\n\n".join(current_chunk_text))
                current_chunk_tokens = current_chunk_tokens[-overlap_tokens:] if overlap_tokens > 0 else []
                current_chunk_text = [tokenizer.decode(current_chunk_tokens)] if current_chunk_tokens else []

            current_chunk_tokens.extend(para_tokens)
            current_chunk_text.append(para)

    if current_chunk_text:
        chunks.append("\n\n".join(current_chunk_text))

    return chunks


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

        document = session.execute(
            select(Document).where(Document.id == doc_uuid)
        ).scalar_one_or_none()

        if document is None:
            return {"status": "not_found", "document_id": document_id}

        try:
            document.status = DOCUMENTSTATUS.PROCESSING
            session.commit()
            
            # 1. Enforce Idempotency by purging stale processing records first (Point 7)
            session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc_uuid))
            session.execute(delete(DocumentParentChunk).where(DocumentParentChunk.document_id == doc_uuid))
            session.commit()
            
            # 2. Native Docling Conversion & Hierarchical Layout Extraction
            converter = DocumentConverter()
            conversion_result = converter.convert(document.file_path)
            docling_doc = conversion_result.document
            
            document.parsed_markdown = docling_doc.export_to_markdown()
            session.commit()
            
            tokenizer = tiktoken.get_encoding("cl100k_base")
            
            # 3. Create Token-Aware Parent Records using Docling layout elements (Point 4 & 10)
            parent_payloads = create_token_aware_parents(docling_doc.elements, tokenizer)
            
            parent_rows = []
            for p in parent_payloads:
                parent_rows.append(
                    DocumentParentChunk(
                        document_id=doc_uuid,
                        parent_index=p["parent_index"],
                        content=p["content"],
                        token_count=p["token_count"],
                        page_start=p["page_start"],
                        page_end=p["page_end"]
                    )
                )

            session.add_all(parent_rows)
            session.flush()  # Extract autogenerated database primary keys

            # 4. Generate Semantic Child Structures
            flat_children_pool = []
            for p_row in parent_rows:
                child_texts = split_parent_into_semantic_children(p_row.content, tokenizer)
                for c_text in child_texts:
                    flat_children_pool.append({
                        "parent_id": p_row.id,
                        "content": c_text,
                        "token_count": len(tokenizer.encode(c_text)),
                        "page_start": p_row.page_start,
                        "page_end": p_row.page_end
                    })

            # 5. Out-of-Loop Batched Embedding Processing (Points 6 & 9)
            if flat_children_pool:
                all_texts = [child["content"] for child in flat_children_pool]
                
                # Single OpenAI API execution call using modern batch input vectorization
                embedding_response = client.embeddings.create(
                    model=EMBEDDING_MODEL,
                    input=all_texts,
                    dimensions=EMBEDDING_DIMENSION
                )
                
                # Assign generated float arrays back to structural chunk instances
                for idx, data_item in enumerate(embedding_response.data):
                    flat_children_pool[idx]["embedding"] = data_item.embedding

            # 6. Database Commit Execution
            child_rows = []
            for c_idx, c_data in enumerate(flat_children_pool):
                child_rows.append(
                    DocumentChunk(
                        document_id=doc_uuid,
                        parent_id=c_data["parent_id"],
                        chunk_index=c_idx,
                        content=c_data["content"],
                        token_count=c_data["token_count"],
                        page_start=c_data["page_start"],
                        page_end=c_data["page_end"],
                        embedding=c_data["embedding"]
                    )
                )

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
