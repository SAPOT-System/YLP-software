from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, BackgroundTasks
from app.models.users import User
from app.db_operations.token import get_current_user
from app.db_operations.auth import SessionDep
from app.db_operations.user_search import search_by_id, search_case_insensitive, _resolve_role
from app.models.users import UserInfo
from app.models.announcement import Announcement, AnnouncementStatusType

router = APIRouter(
    prefix='/user-utils',
    tags=['user utils'],
    responses={
        404: {'description': 'Not Found'}
    },
    # dependencies=[Depends(require_verified_user)]
)

@router.post('/search-user')
def search_user(
    identifier_string: str,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    limit: int = 20,
    offset: int = 0
):
    res = search_case_insensitive(identifier_string, session, limit, offset)
    return {
        "res": res,
        "limit": limit,
        "offset": offset
    }

@router.get('/current-user-info', response_model=UserInfo)
def get_current_user_info(
        current_user : Annotated[User, Depends(get_current_user)],
):

    return UserInfo(
        id=str(current_user.id),
        username=current_user.username,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        phone_number=current_user.phone_number,
        email=current_user.email,
        email_verified=current_user.email_verified,
        phone_verified=bool(current_user.phone_is_verified),
        role=_resolve_role(current_user),
    )


@router.get("/is-admin")
def is_admin(
        current_user: Annotated[User, Depends(get_current_user)]
):
    return bool(current_user.admin)


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


from datetime import datetime, timezone
from typing import Annotated
from fastapi import Depends, HTTPException
from sqlmodel import select

@router.get("/get-announcements")
def get_my_announcements(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 20,
    offset: int = 0,
):
    now = datetime.now(timezone.utc)

    # ---------------------------
    # 1. DETERMINE USER ROLE
    # ---------------------------
    if current_user.admin is not None:
        role = "admin"
    elif current_user.rescuer is not None:
        role = "rescuer"
    else:
        role = "user"

    # ---------------------------
    # 2. BASE QUERY
    # ---------------------------
    query = select(Announcement).where(
        Announcement.status == AnnouncementStatusType.active,
        Announcement.expires_at > now,
    )

    # ---------------------------
    # 3. ROLE FILTERING
    # ---------------------------
    if role == "admin":
        # admins see everything
        pass

    elif role == "rescuer":
        query = query.where(
            Announcement.target_audience.in_(["rescuer", "user"])
        )

    else:  # regular user
        query = query.where(
            Announcement.target_audience == "user"
        )

    # ---------------------------
    # 4. PAGINATION
    # ---------------------------
    query = (
        query.order_by(Announcement.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    results = session.exec(query).all()

    return {
        "role": role,
        "count": len(results),
        "announcements": results
    }
