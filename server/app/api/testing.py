from uuid import UUID
from fastapi import APIRouter, HTTPException

from app.api.admin import makeAdmin, makeRescuer
from app.db_operations.auth import SessionDep, get_user_by_ID, get_user_by_username

router = APIRouter(
    prefix="/testing", tags=["testing endpoint"], responses={404: {"description": "Not Found"}}
)

@router.post("/test-make-admin")
def make_user_admin(username: str, session:SessionDep):
    user = get_user_by_username(
        session,
        username
    )
    if not user:
        raise HTTPException(403, 'User not found')
    makeAdmin(user, session)
    return {"status": "ok"}


@router.post("/test-make-rescuer")
def make_user_rescuer(username: str, session:SessionDep):
    user = get_user_by_username(
        session,
        username
    )
    if not user:
        raise HTTPException(403, 'User not found')
    makeRescuer(user, session)
    return {"status": "ok"}
