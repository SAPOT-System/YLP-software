from datetime import datetime, timedelta, timezone
from app.models.location import UserLocation
from sqlmodel import select, func, desc
from typing import Annotated
from fastapi import Depends, HTTPException, Request, Response, status
from app.db_operations.token import oauth2_scheme
from fastapi.routing import APIRouter
from app.db_operations.token import logout
import time
from fastapi.security import  OAuth2PasswordRequestForm

from app.db_operations.auth import SessionDep, authenticate_user
from app.db_operations.token import RefreshRequest, create_token_pair, get_current_user_admin, refresh_token
from app.models.token import Token
from app.models.users import User


router = APIRouter(
    prefix='/admin',
    tags=['admin'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get("")
def test_if_admin(
        current_user: Annotated[User, Depends(get_current_user_admin)]
):
    return {"status": "ok"}


@router.post("/login") # 1. Added response_model for validation
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
    response: Response
):
    # 2. authenticate_user should ideally return the User object
    user = authenticate_user(session, form_data.username, form_data.password)

    if not user or not user.admin: # ensure is an admin
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Ensure create_token_pair takes the user's UUID
    # We pass user.id to be used as the 'sub' claim
    tokens = create_token_pair(user.id)

    response.set_cookie(
        key="access_token", value=tokens.access_token, 
        httponly=True, secure=True, samesite="lax", max_age=900 # 15 mins
    )
    
    # Refresh Token Cookie (pointing to a specific path for safety)
    response.set_cookie(
        key="refresh_token", value=tokens.refresh_token,
        httponly=True, secure=True, samesite="lax",
        path="/admin/refresh", # Only sent to the refresh endpoint
        max_age=604800 # 7 days
    )

    # 4. Return the full dictionary (access_token, refresh_token, token_type)
    return { "status": "ok" }



@router.post("/refresh")
async def refresh_access_token(
        request: Request,
        response: Response,
        session: SessionDep
):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401)
    try:
        # Validate the refresh token...
        token = RefreshRequest(refresh_token=token)

        new_access_token = refresh_token(token, session)
        
        response.set_cookie(
            key="access_token", value=new_access_token.access_token,
            httponly=True, secure=True, samesite="lax", max_age=900
        )

        response.set_cookie(
            key="refresh_token", value=new_access_token.refresh_token,
            httponly=True, secure=True, samesite="lax",
            path="/admin/refresh", # Only sent to the refresh endpoint
            max_age=604800 # 7 days
        )
        return {"status": "refreshed"}
    except:
        raise HTTPException(status_code=401)



@router.post("/logout")
async def logout_user(
    current_user: Annotated[User, Depends(get_current_user_admin)],
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep,
    request: Request
):
    token_to_be_invalidated = request.cookies.get("refresh_token")
    if not token_to_be_invalidated:
        raise HTTPException(500)
    return logout(token, session)




@router.post("/get-active-users")
def get_all_latest_locations(
    current_user: Annotated[User, Depends(get_current_user_admin)],
        session: SessionDep
        ):
    """
    Returns the most recent location for every user who has sent a ping.
    Useful for the initial map load.
    """
    # Optimized MariaDB Query: Get the latest timestamp per user
    # Note: In high-scale apps, we'd store 'latest_location_id' on the User table 
    # to avoid this subquery, but this is the standard SQLModel way:
    
    subquery = (
        select(UserLocation.user_id, func.max(UserLocation.timestamp).label("max_ts"))
        .group_by(UserLocation.user_id)
        .subquery()
    )
    
    statement = (
        select(UserLocation)
        .join(subquery, (UserLocation.user_id == subquery.c.user_id) & 
                       (UserLocation.timestamp == subquery.c.max_ts))
    )
    
    locations = session.exec(statement).all()
    
    # Format for the frontend (React Native Map)
    ret = {}
    count = 0
    for loc in locations:
        loc_time_utc = loc.timestamp.replace(tzinfo=timezone.utc)
        if loc_time_utc >= datetime.now(timezone.utc) - timedelta(minutes=5):
            count+=1


    ret["active_users"] = count

    total_count = session.exec(
        select(func.count(User.id))
    ).one()

    ret["total_users"] = total_count

    ret["inactive_users"] = total_count - count
    return ret




