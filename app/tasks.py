from app.celery import celery_app
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import time 
from app.model import Document , DOCUMENTSTATUS
import uuid
load_dotenv()
postgres_url = os.getenv("postgres_url")

sync_engine = create_engine(
    postgres_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
)
SyncSession = sessionmaker(sync_engine)

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

       #Loading document
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

            # 3) temporary fake processing time
            time.sleep(5)

            # 4) processing -> ready
            document.status = DOCUMENTSTATUS.READY
            session.commit()

            return {"status": "ready", "document_id": document_id}

        except Exception:
            # 5) if anything fails -> failed
            document.status = DOCUMENTSTATUS.FAILED
            session.commit()
            raise