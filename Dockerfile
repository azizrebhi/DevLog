# Use Python 3.12 as base image
FROM python:3.12-slim

# Set working directory inside container
WORKDIR /app

# Install system dependencies
# - curl: for health checks
# - postgresql-client: for connecting to postgres
RUN apt-get update && apt-get install -y \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first (for better caching)
# Docker caches layers - if these files don't change, 
# it won't reinstall dependencies
COPY pyproject.toml uv.lock ./

# Install uv (fast Python package installer)
RUN pip install uv

# Install Python dependencies using uv
# --no-dev: skip development dependencies
RUN uv sync --no-dev

# Copy application code
# This comes AFTER installing deps so code changes 
# don't invalidate the dependency cache
COPY . .

# Expose port 8000 for FastAPI
EXPOSE 8000

# Default command (can be overridden in docker-compose)
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]