from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, Request
import jwt
from sqlmodel import Session, select
from app.db_operations.token import ALGORITHM, SECRET_KEY
from app.models.activity import UserActivity
from app.db_operations.auth import SessionDep, engine

async def activity_tracking_middleware(request: Request, call_next):
    # 1. Let the request finish (so we don't slow down the user)
    response = await call_next(request)
    
    # 2. Check if user is authenticated (set by your Auth middleware)
    auth_header = request.headers.get("Authorization")
    
    # 2. Check if the header exists and starts with "Bearer "
    if not auth_header or not auth_header.startswith("Bearer "):
        return response

    try:
        # 3. Strip "Bearer " from the string to get just the token
        token = auth_header.split(" ")[1]
        
        # 4. Decode
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = UUID(payload.get("sub"))
        if user_id:
            # with Session(engine) as session:
            with Session(engine) as session:
                print("inactivity tracking 2")
                # Check if an activity record exists
                statement = select(UserActivity).where(UserActivity.user_id == user_id)
                activity = session.exec(statement).first()
                
                if not activity:
                    # Create new record if it doesn't exist
                    activity = UserActivity(
                        user_id=user_id,
                        ip_address=request.client.host,
                        user_agent=request.headers.get("user-agent")
                    )
                    session.add(activity)
                
                # Update the heartbeat
                activity.last_active = datetime.now(timezone.utc)
                activity.status = "Active"
                if not request.client:
                    raise HTTPException(500, "server error")
                activity.ip_address = request.client.host
                
                session.add(activity)
                session.commit()
            
    except Exception as e:
        # If the token is expired or invalid, just ignore it and move on
        print(f"Activity tracking failed: {e}")
        pass
            
    return response
