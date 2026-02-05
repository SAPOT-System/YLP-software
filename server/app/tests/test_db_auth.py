#!/usr/bin/env python3

import pytest
import logging
import uuid
import pytest
from sqlmodel import SQLModel, Session, StaticPool, create_engine, select

from app.main import app
from fastapi.testclient import TestClient

from app.db_operations.auth import SessionDep, db_create_user, get_password_hash, get_session, get_user_by_email, get_user_by_phone_number, get_user_by_username, verify_password
from app.models.users import User, UserCreate
from app.tests.assets import dummy_data, sample_users
from app.db_operations.auth import update_user_info
from app.models.users import UserUpdate

def test_db_create_user_with_id(session: SessionDep):
    user = db_create_user(
        session=session,
        user=UserCreate(**dummy_data)
    )

    assert user.id == dummy_data.get('id')
    assert user.username == dummy_data.get('username')
    assert user.last_name == dummy_data.get('last_name')
    assert user.first_name == dummy_data.get('first_name')
    assert user.phone_number == dummy_data.get('phone_number')
    assert user.email == dummy_data.get('email')
    assert verify_password(str(dummy_data.get('password')), user.hashed_password)


def test_db_get_users_by_email(session : SessionDep):
    user_data = sample_users['steve_rogers']
    user = get_user_by_email(session, user_data.get('email'))

    assert user
    assert user.username == user_data.get('username')
    assert user.last_name == user_data.get('last_name')
    assert user.first_name == user_data.get('first_name')
    assert user.phone_number == user_data.get('phone_number')
    assert user.email == user_data.get('email')
    assert verify_password(str(user_data.get('password')), user.hashed_password)


def test_db_get_users_by_username(session : SessionDep):
    user_data = sample_users['steve_rogers']
    user = get_user_by_username(session, user_data.get('username'))

    assert user
    assert user.username == user_data.get('username')
    assert user.last_name == user_data.get('last_name')
    assert user.first_name == user_data.get('first_name')
    assert user.phone_number == user_data.get('phone_number')
    assert user.email == user_data.get('email')
    assert verify_password(str(user_data.get('password')), user.hashed_password)


def test_db_get_users_by_phone_number(session : SessionDep):
    user_data = sample_users['test']
    user = get_user_by_phone_number(session, user_data.get('phone_number'))

    assert user
    assert user.username == user_data.get('username')
    assert user.last_name == user_data.get('last_name')
    assert user.first_name == user_data.get('first_name')
    assert user.phone_number == user_data.get('phone_number')
    assert user.email == user_data.get('email')
    assert verify_password(str(user_data.get('password')), user.hashed_password)


def test_db_change_info(session : SessionDep):
    user_data = sample_users['test']
    new_username = 'testing_new_username'

    user = get_user_by_username(session, str(user_data.get('username')))
    print("USERR", user)
    update_model = UserUpdate(
        username=new_username
    )
    update_user_info(user, update_model, session)

    # test if the update occured
    user = get_user_by_username(session, new_username)
    assert user
    assert user.username == new_username
