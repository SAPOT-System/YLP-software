from typing import Annotated
import logging
from fastapi import WebSocketException, status
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.db_operations.auth import SessionDep, get_user_by_ID
from sqlmodel import Session
from datetime import datetime, timezone
from fastapi.routing import APIRouter
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, func, desc
from typing import List
import uuid


from app.db_operations.token import get_current_user, get_current_user_rescuer
from app.db_operations.websockets import authenticate_websocket
from app.models.users import User
from app.models.location import UserLocation
from app.db_operations.GPS_manager import gps_manager


router = APIRouter(
    prefix='/gps',
    tags=['GPS'],
    responses={
        404: {'description': 'Not Found'}
    }
)


@router.websocket("/ws/{user_id}")
async def stream_gps_location(
    websocket: WebSocket,
    user_id: str,
    token: str,
    session: SessionDep
):
    authed_id = await authenticate_websocket(websocket, token)
    if str(authed_id) != user_id:
        await websocket.close(code=1008)
        return
    await websocket.accept()

    try:
        user_uuid = uuid.UUID(user_id)
        user = session.exec(select(User).where(User.id == user_uuid)).first()
        if not user:
            await websocket.close(code=4004, reason="user_not_found")
            return
        
        while True:
            # 1. Receive data from React Native
            # Expected: {"lat": 14.123, "lng": 120.456}
            data = await websocket.receive_json()

            # 2. Create the SQLModel instance
            new_location = UserLocation(
                user_id=user_uuid,
                latitude=data["lat"],
                longitude=data["lng"],
                timestamp=datetime.now(timezone.utc)
            )

            # 3. Save to MariaDB
            session.add(new_location)
            session.commit()

            # 4. Prepare the Broadcast Payload
            # We include the user_id so Rescuers know WHO moved
            broadcast_payload = {
                "user_id": user_id,
                "latitude": data["lat"],
                "longitude": data["lng"],
                "timestamp": new_location.timestamp.isoformat(),
                "username": user.username
            }

            # 5. Push to all Rescuers in real-time
            await gps_manager.broadcast_to_rescuers(broadcast_payload)

    except WebSocketDisconnect:
        # We don't "raise" here because a disconnect is a normal event.
        # We just clean up.
        gps_manager.disconnect_monitor(user_id)
        print(f"Connection closed gracefully for user: {user_id}")

    except Exception as e:
        # 1. Log the full stack trace so you can debug it later
        print(f"FATAL GPS ERROR for user {user_id}: {str(e)}")

        # 2. Raise a specific WebSocket error to close the connection properly
        # This tells the React Native app EXACTLY why it was kicked off.
        raise WebSocketException(
            code=status.WS_1011_INTERNAL_ERROR,
            reason="Server encountered an error processing GPS data"
        ) from e


@router.get("/latest")
def get_all_latest_locations(
        current_user : Annotated[User, Depends(get_current_user_rescuer)],
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
        select(UserLocation, User.username)
        .join(User, User.id == UserLocation.user_id)
        .join(subquery, (UserLocation.user_id == subquery.c.user_id) & 
                       (UserLocation.timestamp == subquery.c.max_ts))
    )

    locations = session.exec(statement).all()

    # Format for the frontend (React Native Map)
    return [
        {
            "user_id": loc.user_id,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "timestamp": loc.timestamp,
            "username": username
        } for loc, username in locations
    ]

@router.get("/history/{user_id}")
def get_user_location_history(
    current_user : Annotated[User, Depends(get_current_user_rescuer)],
    user_id: uuid.UUID, 
    session: SessionDep, 
    limit: int = 50
):
    """
    Returns the last 'X' locations for a specific user to show their path.
    """
    statement = (
        select(UserLocation)
        .where(UserLocation.user_id == user_id)
        .order_by(desc(UserLocation.timestamp))
        .limit(limit)
    )
    
    history = session.exec(statement).all()
    
    if not history:
        raise HTTPException(status_code=404, detail="No location history found for this user")
        
    return history


@router.websocket("/ws/monitor/rescuers/{rescuer_id}")
async def monitor_live_feed(
    websocket: WebSocket, 
    rescuer_id: str
):
    # 1. Connect and add to the broadcast list
    await gps_manager.connect_monitor(rescuer_id, websocket)
    
    try:
        while True:
            # Keep the connection open. 
            # We don't expect data FROM the rescuer, but we need to 
            # listen for the 'close' event or heartbeats.
            await websocket.receive_text() 
            
    except WebSocketDisconnect as e:
        gps_manager.disconnect_monitor(rescuer_id)
        print(f"Rescuer {rescuer_id} stopped monitoring.")
        # raise e
