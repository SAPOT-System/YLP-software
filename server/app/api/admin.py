from datetime import datetime, timedelta, timezone
import platform
import subprocess
import time
from collections import deque
from fastapi import APIRouter
from pythonping import ping
import psutil
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




@router.get("/get-active-users")
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

ping_history = deque(maxlen=300)

def perform_ping_probe():
    """Run a quick ping using the system binary to avoid permission issues."""
    host = "192.168.254.124"
    # -c for Linux/macOS, -n for Windows
    flag = "-n" if platform.system().lower() == "windows" else "-c"
    
    try:
        # We send 1 packet with a 1-second timeout
        # Using subprocess avoids the 100% loss/root permission bug
        result = subprocess.run(
            ["ping", flag, "1", "-W", "1", host] if flag == "-c" else ["ping", flag, "1", host],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2 # Safety timeout for the process itself
        )
        # Success if return code is 0
        ping_history.append(result.returncode == 0)
    except Exception:
        ping_history.append(False)

@router.get("/get-network-usage")
async def get_live_speed(
    current_user: Annotated[User, Depends(get_current_user_admin)],
):
    # 1. Measure Network Traffic (1 second delta)
    old_value = psutil.net_io_counters()
    time.sleep(1) 
    new_value = psutil.net_io_counters()

    # Calculate Mbps
    download = (new_value.bytes_recv - old_value.bytes_recv) * 8 / 1024 / 1024
    upload = (new_value.bytes_sent - old_value.bytes_sent) * 8 / 1024 / 1024

    # 2. Run a fresh ping probe
    perform_ping_probe()
    
    # 3. Calculate Loss Rate from history
    total_samples = len(ping_history)
    if total_samples == 0:
        loss_percentage = 0.0
    else:
        lost_packets = ping_history.count(False)
        loss_percentage = (lost_packets / total_samples) * 100
    
    return {
        "download_mbps": round(download, 2),
        "upload_mbps": round(upload, 2),
        "loss_percent": round(loss_percentage, 2),
        "interface": "all",
        "samples_in_memory": total_samples,
        "time_window": "5 minutes (max)"
    }
