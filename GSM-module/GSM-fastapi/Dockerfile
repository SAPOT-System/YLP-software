# syntax=docker/dockerfile:1

FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY requirements.txt ./
RUN uv venv /opt/venv && \
    uv pip install --python /opt/venv/bin/python -r requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

COPY . .

EXPOSE 8001

CMD ["python", "main.py"]
