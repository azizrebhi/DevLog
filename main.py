from fastapi import FastAPI
from app.routers import auth ,session , summary , github
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # We remove create_db_and_tables() because Alembic 
    # handles the schema updates now.
    print("Starting up...")
    yield
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)

# Include your auth router
app.include_router(auth.router)
app.include_router(session.router)
app.include_router(summary.router)
app.include_router(github.router)

@app.get("/")
async def root():
    return {"message": "Server is running"}
