from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, BackgroundTasks
from app.models.users import User
from app.db_operations.token import get_current_user
from app.db_operations.auth import SessionDep
from app.db_operations.user_search import search_by_id, search_case_insensitive
from app.models.users import UserInfo

router = APIRouter(
    prefix='/user-utils',
    tags=['user utils'],
    responses={
        404: {'description': 'Not Found'}
    },
    # dependencies=[Depends(require_verified_user)]
)

@router.post('/search-user')
def search_username(
        username: str,
        current_user : Annotated[User, Depends(get_current_user)],
        session: SessionDep
):
    res = search_case_insensitive(username, session)
    return {'res': res}

@router.get('/current-user-info', response_model=UserInfo)
def get_current_user_info(
        current_user : Annotated[User, Depends(get_current_user)],
):

    return current_user


@router.get("/search-user/{id}")
def search_user_by_id(
        user_id: str,
        current_user : Annotated[User, Depends(get_current_user)],
        session: SessionDep
        ):
    try:
        res = search_by_id(value=UUID(user_id), session=session)
        return res
    except Exception:
        raise HTTPException(404, "invalid id or non-existent in database")


@router.get("/is-rescuer")
def is_rescuer(
        current_user: Annotated[User, Depends(get_current_user)]
):
    return bool(current_user.rescuer)
