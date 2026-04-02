import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.main import app  # Import your FastAPI app instance
from app.models.location import UserLocation # Import your model
import uuid
import json


def test_stream_gps_location_success(client: TestClient):
    """
    Test that a user can connect to the GPS WebSocket and send coordinates.
    """
    test_user_id = str(uuid.uuid4())
    payload = {"lat": 14.4589, "lng": 120.9486}

    # 1. Open the WebSocket connection
    # Note: the path must match your router's path
    with client.websocket_connect(f"/ws/gps/{test_user_id}") as websocket:

        # 2. Send the JSON data (Simulating the React Native 'send')
        websocket.send_json(payload)

        # In a real app, the server doesn't necessarily 'reply' to the sender,
        # it broadcasts to others. But we can verify the connection stayed open.
        # If your code sends a confirmation back, you would use:
        # data = websocket.receive_json()
        # assert data["status"] == "received"

        assert websocket.scope["path"] == f"/ws/gps/{test_user_id}"

def test_stream_gps_invalid_data(client: TestClient):
    """
    Test how the WebSocket handles garbage data.
    """
    test_user_id = str(uuid.uuid4())

    with client.websocket_connect(f"/ws/gps/{test_user_id}") as websocket:
        # Sending a string instead of the expected JSON object
        websocket.send_text("not-a-json")

        # The connection should ideally close or handle the error
        # depending on your Exception blocks.
        with pytest.raises(Exception):
            websocket.receive_json()


def test_get_all_latest_locations(client: TestClient, session):
    """
    Test that /gps/latest only returns the MOST RECENT ping per user.
    """
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    
    # User A - Old ping
    loc1 = UserLocation(user_id=user_a, latitude=10.0, longitude=10.0, 
                        timestamp=datetime.now(timezone.utc) - timedelta(minutes=10))
    # User A - New ping (This should be the one returned)
    loc2 = UserLocation(user_id=user_a, latitude=11.0, longitude=11.0, 
                        timestamp=datetime.now(timezone.utc))
    # User B - Only one ping
    loc3 = UserLocation(user_id=user_b, latitude=20.0, longitude=20.0)

    session.add_all([loc1, loc2, loc3])
    session.commit()

    response = client.get("/ws/gps/latest")
    assert response.status_code == 200
    data = response.json()

    # Should return exactly 2 records (one for each user)
    assert len(data) == 2
    
    # Verify User A's data is the LATEST one (latitude 11.0)
    user_a_record = next(item for item in data if item["user_id"] == str(user_a))
    assert user_a_record["latitude"] == 11.0

def test_get_user_location_history(client: TestClient, session):
    """
    Test that /gps/history/{user_id} returns multiple pings for one user.
    """
    user_id = uuid.uuid4()
    
    # Create 5 pings for this user
    for i in range(5):
        loc = UserLocation(
            user_id=user_id, 
            latitude=15.0 + i, 
            longitude=121.0, 
            timestamp=datetime.now(timezone.utc) - timedelta(minutes=i)
        )
        session.add(loc)
    
    session.commit()

    response = client.get(f"/ws/gps/history/{user_id}?limit=3")
    assert response.status_code == 200
    data = response.json()

    # Check that it respected the 'limit' parameter
    assert len(data) == 3
    # Check that it's ordered by timestamp DESC (Newest first)
    # The first item should be the one with 0 minutes offset (lat 15.0)
    assert data[0]["latitude"] == 15.0

def test_get_history_not_found(client: TestClient):
    """
    Test 404 behavior for users with no data.
    """
    random_id = uuid.uuid4()
    response = client.get(f"/ws/gps/history/{random_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "No location history found for this user"



def test_gps_broadcast_to_rescuer(client, session, test_user, test_rescuer):
    user_id_str = str(test_user.id)
    rescuer_id_str = str(test_rescuer.id)
    payload = {"lat": 14.5, "lng": 121.0}

    # 1. Start the Rescuer monitor
    with client.websocket_connect(f"/ws/gps/monitor/rescuers/{rescuer_id_str}") as rescuer_ws:
        
        # 2. Open AND CLOSE the user connection
        # This triggers the broadcast while the rescuer is still 'alive' inside the 'with' block
        with client.websocket_connect(f"/ws/gps/{user_id_str}") as user_ws:
            user_ws.send_json(payload)
            
        # 3. Verify the broadcasted data was received
        received = rescuer_ws.receive_json()
        assert received["user_id"] == user_id_str
        assert received["latitude"] == 14.5
        
    # After exiting the block, the rescuer is disconnected 
    # and the 'raise' inside your endpoint is handled by the TestClient

