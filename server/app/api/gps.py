from typing import Annotated
import logging
from fastapi import WebSocketException, status
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.db_operations.auth import SessionDep
from sqlmodel import Session
from datetime import datetime, timezone
import uuid
from fastapi.routing import APIRouter
import time

from app.db_operations.token import get_current_user
from app.models.users import User
from app.models.location import UserLocation
from app.db_operations.GPS_manager import gps_manager


router = APIRouter(
    prefix='/ws/gps',
    tags=['GPS'],
    responses={
        404: {'description': 'Not Found'}
    }
)


@router.websocket("/{user_id}")
async def stream_gps_location(
    websocket: WebSocket,
    user_id: str,
    session: SessionDep # Use your Session dependency
):
    await websocket.accept()

    try:
        user_uuid = uuid.UUID(user_id)

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
                "timestamp": new_location.timestamp.isoformat()
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
