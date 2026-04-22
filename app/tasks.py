from app.celery import celery_app
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from app.model import User, Session
import os
from datetime import datetime, timedelta, timezone
from app.summary import calculate_summary  # Import your summary function

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
def generate_weekly_summaries():
    from app.model import WeeklySummary
    with SyncSession() as session:
        users = session.execute(select(User)).scalars().all()
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        week_start = seven_days_ago.replace(hour=0, minute=0, second=0, microsecond=0)
        for user in users:
            sessions_7d = session.execute(
                select(Session).where(
                    Session.user_id == user.id,
                    Session.date >= seven_days_ago
                )
            ).scalars().all()
            summary_data = calculate_summary(sessions_7d)
            new_summary = WeeklySummary( 
                user_id=user.id,
                week_start=week_start,
                total_sessions=summary_data["total_sessions"],
                total_minutes=summary_data["total_minutes"],
                top_project=summary_data["top_project"],
                most_common_blocker=summary_data["most_common_blocker"],
            )
            session.add(new_summary)  
        session.commit()   
        return True  