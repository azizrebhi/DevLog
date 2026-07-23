from app.celery import celery_app
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker
import tiktoken
from openai import OpenAI
import os
from app.model import Document, DOCUMENTSTATUS, DocumentChunk
import uuid

load_dotenv()
postgres_url = os.getenv("postgres_url")
sync_engine = create_engine(
    postgres_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
)
SyncSession = sessionmaker(sync_engine)
open_ai_key = os.getenv("OPEN_AI_KEY")
client = OpenAI(api_key=open_ai_key)


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
            # 2) pending -> processing
            document.status = DOCUMENTSTATUS.PROCESSING
            session.commit()
            
            # docling parsing 
            converter = DocumentConverter()
            doc = converter.convert(document.file_path).document
            
            # 4) processing -> ready
            document.parsed_markdown = doc.export_to_markdown()
            session.commit()
            
            # Initialize tiktoken tokenizer matching text-embedding-3-small (cl100k_base)
            tokenizer = tiktoken.get_encoding("cl100k_base")
            
            # Configure HybridChunker with fixed size, tokenizer, and item merging rules
            chunker = HybridChunker(
                tokenizer=tokenizer,
                max_tokens=400,
                merge_updates=True
            )
            
            chunks = chunker.chunk(doc)
            list_chunks = []
            
            for idx, ch in enumerate(chunks): 
                # Use serialize method to extract structured text safely without string duplication loops
                text = chunker.serialize(ch).strip()
                
                if text != "": 
                    # Calculate exact token count using your initialized tokenizer
                    token_count = len(tokenizer.encode(text))
                    
                    response = client.embeddings.create(
                        model="text-embedding-3-small",
                        input=text,
                        dimensions=384 
                    )
                    embedding = response.data[0].embedding
                    
                    # Extract page ranges cleanly from Docling chunk metadata
                    page_start = ch.meta.doc_items[0].prov[0].page_no if ch.meta and ch.meta.doc_items and ch.meta.doc_items[0].prov else None
                    page_end = ch.meta.doc_items[-1].prov[0].page_no if ch.meta and ch.meta.doc_items and ch.meta.doc_items[-1].prov else None
                    
                    list_chunks.append(
                        DocumentChunk(
                            document_id=doc_uuid,
                            chunk_index=idx,
                            content=text, 
                            token_count=token_count,
                            page_start=page_start,
                            page_end=page_end,
                            embedding=embedding
                        )
                    )
          
            session.add_all(list_chunks) 
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
