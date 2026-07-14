from sqlmodel import Session, select

from app.models.admin_push_token import AdminPushToken


def test_admin_push_token_table_is_created(session: Session):
    # The `session` fixture (conftest.py) calls SQLModel.metadata.create_all,
    # so the table exists only if the model is registered in metadata.
    rows = session.exec(select(AdminPushToken)).all()
    assert rows == []
