#!/usr/bin/env python3
import uuid
import pytest
from sqlmodel import SQLModel, Session, StaticPool, create_engine
from app.db_operations.device_attempts import (
    ATTEMPT_BUDGETS,
    COOLDOWN_TIERS,
    check_and_increment_attempt,
    reset_attempts,
)


@pytest.fixture(name="mem_session")
def mem_session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_anonymous_budget_defined():
    assert "anonymous" in ATTEMPT_BUDGETS
    assert ATTEMPT_BUDGETS["anonymous"] > 0


def test_anonymous_cooldown_defined():
    assert "anonymous" in COOLDOWN_TIERS
    assert len(COOLDOWN_TIERS["anonymous"]) == 4
