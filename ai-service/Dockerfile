FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY ai-service/ .

RUN mkdir -p uploads models \
    && python scripts/download_models.py || true

EXPOSE 5000

ENV ANPR_PIPELINE=auto

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
