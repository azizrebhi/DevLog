import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")

celery_app = Celery(
    "devlog",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks"]
)

celery_app.conf.timezone = "UTC"
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "weekly-summaries": {
        "task": "app.tasks.generate_weekly_summaries",
        "schedule": crontab( hour= 0 ,minute=0 ,day_of_week=0 ),
    }
}