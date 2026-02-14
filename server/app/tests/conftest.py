#!/usr/bin/env python3


import pytest
import logging
import uuid
import pytest
from sqlmodel import SQLModel, Session, StaticPool, create_engine, select

from app.main import app
from fastapi.testclient import TestClient

from app.db_operations.auth import SessionDep, db_create_user, get_password_hash, get_session, verify_password
from app.models.users import User, UserCreate
from app.tests.assets import sample_users


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:

        for _,hero_data in sample_users.items():
            hero = User(**hero_data)
            session.add(hero)
            session.commit()
            session.refresh(hero)
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
