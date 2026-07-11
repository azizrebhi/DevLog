from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth ,workspace ,documents , Retrieval
from contextlib import asynccontextmanager
from app.logging_config import configure_logging  
from app.middleware import RequestIDMiddleware     
configure_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up...")
    yield
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)

# Include your auth router
app.include_router(auth.router)
app.include_router(workspace.router)
app.include_router(documents.router)
app.include_router(Retrieval.router)




@app.get("/")
async def root():
    return {"message": "Server is running"}
