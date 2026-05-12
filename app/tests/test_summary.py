# app/tests/test_summary_logic.py
from app.summary import calculate_summary
from app.model import Session
from datetime import datetime, timezone
import uuid

def test_calculate_summary_empty():
    result = calculate_summary([])
    assert result["total_sessions"] == 0
    assert result["total_minutes"] == 0
    assert result["top_project"] is None
    assert result["most_common_blocker"] is None

def test_calculate_summary_single_session():
    # Create a mock Session object
    session = Session(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        project="DevLog",
        worked_on="Testing",
        duration="120",
        what_learned="pytest",
        blockers="none",
        date=datetime.now(timezone.utc)
    )
    result = calculate_summary([session])
    assert result["total_sessions"] == 1
    assert result["total_minutes"] == 120
    assert result["top_project"] == "DevLog"
    assert result["most_common_blocker"] == "none"

def test_calculate_summary_multiple_sessions():
    sessions = [
        Session(id=uuid.uuid4(), user_id=uuid.uuid4(), project="DevLog", 
                duration="60", blockers="Docker", worked_on="test", 
                what_learned="x", date=datetime.now(timezone.utc)),
        Session(id=uuid.uuid4(), user_id=uuid.uuid4(), project="DevLog", 
                duration="90", blockers="Docker", worked_on="test", 
                what_learned="x", date=datetime.now(timezone.utc)),
        Session(id=uuid.uuid4(), user_id=uuid.uuid4(), project="OtherApp", 
                duration="30", blockers="API", worked_on="test", 
                what_learned="x", date=datetime.now(timezone.utc)),
    ]
    result = calculate_summary(sessions)
    assert result["total_sessions"] == 3
    assert result["total_minutes"] == 180
    assert result["top_project"] == "DevLog"  # appears 2x
    assert result["most_common_blocker"] == "Docker"  # appears 2x