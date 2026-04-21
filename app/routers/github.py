from fastapi import APIRouter, Request

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("/github")
async def github_webhook(request: Request):
    payload = await request.json()
    event_type = request.headers.get("X-GitHub-Event")
    print(f"Received event: {event_type}")
    print(payload)
    return {"status": "received"}