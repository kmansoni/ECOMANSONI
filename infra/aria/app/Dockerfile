FROM python:3.12-slim AS base
WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd --create-home aria
USER aria
ENV PATH="/home/aria/.local/bin:$PATH" PYTHONUNBUFFERED=1

# Install Python deps
COPY --chown=aria:aria requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=aria:aria . .

EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "2", "--log-level", "info"]
