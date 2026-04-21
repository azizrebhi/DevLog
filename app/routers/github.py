import sys
from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_async_session
from app.model import Session, User

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("/github")
async def github_webhook(
    request: Request,
    session: AsyncSession = Depends(get_async_session)):
    payload = await request.json()
    event_type = request.headers.get("X-GitHub-Event")

    # Only process push events
    if event_type != "push":
        return {"status": "ignored", "event": event_type}

    # Extract data from payload
    repo_name = payload.get("repository", {}).get("name", "unknown")
    commits = payload.get("commits", [])
    if not commits:
        return {"status": "no commits"}
    # Collect commit messages and files changed
    commit_messages = [c.get("message", "") for c in commits]
    files_added = []
    files_modified = []
    for c in commits:
        files_added.extend(c.get("added", []))
        files_modified.extend(c.get("modified", []))

    worked_on = "; ".join(commit_messages)
    files_changed = list(set(files_added + files_modified))
    what_learned = f"Files changed: {', '.join(files_changed[:10])}"

    # Find user by email (check both pusher and commit author emails)
    pusher_email = payload.get("pusher", {}).get("email", "")
    author_email = commits[0].get("author", {}).get("email", "") if commits else ""
    user = None
    for email in [author_email, pusher_email]:
        if email:
            result = await session.execute(
                select(User).where(User.email == email)
            )
            user = result.scalar_one_or_none()
            if user:
                break

    if not user:
        print(f"No user found for emails: {author_email}, {pusher_email}", flush=True, file=sys.stderr)
        return {"status": "user not found", "emails_checked": [author_email, pusher_email]}

    # Create session from webhook data
    new_session = Session(
        project=repo_name,
        user_id=user.id,
        worked_on=worked_on,
        duration=str(len(commits) * 15),  # Estimate: 15 min per commit
        what_learned=what_learned,
        blockers="",
    )
    session.add(new_session)
    await session.commit()

    print(f"Session created for {user.email} from {repo_name}: {worked_on}", flush=True, file=sys.stderr)
    return {"status": "session created", "project": repo_name, "commits": len(commits)}
