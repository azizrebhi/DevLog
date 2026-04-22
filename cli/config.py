import os
import json
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "devlog"
CONFIG_FILE = CONFIG_DIR / "config.json"

def save_token(token: str):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump({"token": token}, f)

def get_token() -> str | None:
    if not CONFIG_FILE.exists():
        return None
    with open(CONFIG_FILE) as f:
        return json.load(f).get("token")

BASE_URL = os.getenv("DEVLOG_API_URL", "http://localhost:8000")