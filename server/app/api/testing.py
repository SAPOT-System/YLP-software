from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException

from app.api.admin import makeAdmin, makeRescuer
from app.db_operations.auth import SessionDep, get_user_by_username
from app.db_operations.token import get_current_user_admin
from app.models.users import User

router = APIRouter(
    prefix="/testing", tags=["testing endpoint"], responses={404: {"description": "Not Found"}}
)

@router.post("/test-make-admin")
def make_user_admin(
    username: str,
    session: SessionDep,
    _: Annotated[User, Depends(get_current_user_admin)],
):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(404, "User not found")
    makeAdmin(user, session)
    return {"status": "ok"}


@router.post("/test-make-rescuer")
def make_user_rescuer(
    username: str,
    session: SessionDep,
    _: Annotated[User, Depends(get_current_user_admin)],
):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(404, "User not found")
    makeRescuer(user, session)
    return {"status": "ok"}
