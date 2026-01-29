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
from app.tests.assets import dummy_data

def test_db_create_user_with_id(session: SessionDep):
    user = db_create_user(
        session=session,
        user=UserCreate(**dummy_data)
    )

    assert user.id == dummy_data.get('id')
    assert user.name == dummy_data.get('name')
    assert user.phone_number == dummy_data.get('phone_number')
    assert user.email == dummy_data.get('email')
    assert verify_password(dummy_data.get('password'), user.hashed_password)
