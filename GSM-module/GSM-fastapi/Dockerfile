# syntax=docker/dockerfile:1

FROM python:3.13-slim AS base

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY requirements.txt ./
RUN uv venv /opt/venv && \
    uv pip install --python /opt/venv/bin/python -r requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

COPY . .

FROM base AS emulator

EXPOSE 8001 8002

CMD ["python", "main.py"]

FROM base AS production

COPY api.py app_version.py config.py database.py main.py protocol.py serial_worker.py sms_handler.py ./
COPY models ./models

EXPOSE 8001

CMD ["python", "main.py"]
