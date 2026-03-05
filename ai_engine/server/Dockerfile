FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY ai_engine/server/requirements.txt /app/server_requirements.txt
RUN pip install --no-cache-dir -r server_requirements.txt

# Copy AI engine
COPY ai_engine/ /app/ai_engine/

# Environment
ENV PYTHONPATH=/app
ENV PORT=8000

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["python", "-m", "uvicorn", "ai_engine.server.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
