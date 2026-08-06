# syntax=docker/dockerfile:1

FROM python:3.13-slim AS builder

RUN pip install --no-cache-dir uv

WORKDIR /build
COPY app/requirements.txt ./app/requirements.txt
RUN uv venv /opt/venv && \
    uv pip install --python /opt/venv/bin/python -r app/requirements.txt

FROM python:3.13-slim AS runtime

RUN groupadd --system app && useradd --system --gid app --create-home app

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /home/app/server
COPY app ./app
COPY static ./static
COPY alembic.ini ./alembic.ini

RUN mkdir -p logs && chown -R app:app /home/app/server
USER app

EXPOSE 8000

CMD ["gunicorn", "app.main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "5", \
     "-b", "0.0.0.0:8000", \
     "--timeout", "130", \
     "--graceful-timeout", "30", \
     "--worker-connections", "200", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "100", \
     "--access-logfile", "logs/gunicorn-access.log", \
     "--error-logfile", "logs/gunicorn-error.log"]
