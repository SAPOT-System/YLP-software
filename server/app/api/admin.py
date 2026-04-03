from typing import Annotated
from fastapi import Depends, HTTPException, Response, status
from fastapi.routing import APIRouter
import time
from fastapi.security import  OAuth2PasswordRequestForm

from app.db_operations.auth import SessionDep, authenticate_user
from app.db_operations.token import create_token_pair, get_current_user_admin
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
        path="/api/auth/refresh", # Only sent to the refresh endpoint
        max_age=604800 # 7 days
    )

    # 4. Return the full dictionary (access_token, refresh_token, token_type)
    return { "status": "ok" }
