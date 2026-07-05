# app/middleware.py
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

logger = structlog.get_logger()

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = str(uuid.uuid4())
        structlog.contextvars.bind_contextvars(request_id=request_id)
        
        logger.info(
            "request_started",
            method=request.method,
            path=request.url.path,
            client=request.client.host
        )
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        
        logger.info(
            "request_completed",
            status_code=response.status_code,
        )
        
        return response