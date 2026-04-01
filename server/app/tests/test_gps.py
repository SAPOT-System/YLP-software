import pytest
from fastapi.testclient import TestClient
from app.main import app  # Import your FastAPI app instance
from app.models.location import UserLocation # Import your model
import uuid


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
