#!/usr/bin/env python3
"""Seed the local development database with sample users, conversations, messages, and calls.

`server/app/` is itself the `app` package (it has an `__init__.py`), so `-m app...` needs
`server/` — the package's *parent* — as the working directory, not `server/app/`.

Docker stack (docs/getting-started/docker-setup.md) — simplest, network access guaranteed:

    docker compose exec api python -m app.scripts.seed_db

Bare-metal (docs/getting-started/server-setup.md), from `server/` using the project venv:

    cd server
    ENVIRONMENT=development ./app/venv/bin/python -m app.scripts.seed_db

Idempotent: re-running skips records that already exist (matched by username / conversation
title), so it's safe to run after every `docker compose up` without duplicating data.

Thin CLI over `app/db_operations/qa_scenarios.py`, which also backs the `/testing/*` HTTP
scenario surface — see that module for the actual seeding logic.
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()

if os.environ.get("ENVIRONMENT") != "development":
    sys.exit(
        "Refusing to seed: ENVIRONMENT must be 'development' "
        f"(got {os.environ.get('ENVIRONMENT')!r}). This script writes sample data "
        "and must never run against a production database."
    )

from sqlmodel import Session

from app.db_operations.auth import create_db_and_tables, engine
from app.db_operations.qa_scenarios import BULK_MESSAGE_TARGET, build_baseline


def run() -> None:
    create_db_and_tables()
    with Session(engine) as session:
        summary = build_baseline(session)

    print(f"Users: {summary['users']} (created or already present)")
    print(f"Admin: {summary['admin']} ({summary['admin_email']})")
    print(
        f"Conversations: {summary['conversations']} direct conversation(s), each with a call "
        f"log; the first has >= {BULK_MESSAGE_TARGET} messages for pagination testing"
    )
    print("Seed complete.")


if __name__ == "__main__":
    run()
