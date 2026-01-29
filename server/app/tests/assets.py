#!/usr/bin/env python3
import uuid
from app.db_operations.auth import get_password_hash

sample_users = {
    "test": {
        "id": uuid.uuid4(),
        "name": "test",
        "phone_number": "+638788667676",
        "email": "test@test.com",
        "password": "test_password",
        "hashed_password": get_password_hash("test_password"),
    },
    "tony_stark": {
        "id": uuid.uuid4(),
        "name": "Tony Stark",
        "phone_number": "+639171234567",
        "email": "tony@stark-industries.com",
        "password": "ironman_secret",
        "hashed_password": get_password_hash("ironman_secret"),
    },
    "steve_rogers": {
        "id": uuid.uuid4(),
        "name": "Steve Rogers",
        "phone_number": "+639182345678",
        "email": "cap@avengers.org",
        "password": "brooklyn_99",
        "hashed_password": get_password_hash("brooklyn_99"),
    },
    "natasha_romanoff": {
        "id": uuid.uuid4(),
        "name": "Natasha Romanoff",
        "phone_number": "+639193456789",
        "email": "blackwidow@shield.gov",
        "password": "red_room_2024",
        "hashed_password": get_password_hash("red_room_2024"),
    },
    "bruce_banner": {
        "id": uuid.uuid4(),
        "name": "Bruce Banner",
        "phone_number": "+639204567890",
        "email": "hulk.smash@gamma.edu",
        "password": "always_angry_123",
        "hashed_password": get_password_hash("always_angry_123"),
    },
    "thor_odinson": {
        "id": uuid.uuid4(),
        "name": "Thor Odinson",
        "phone_number": "+639215678901",
        "email": "pointbreak@asgard.com",
        "password": "mjolnir_rocks",
        "hashed_password": get_password_hash("mjolnir_rocks"),
    },
    "wanda_maximoff": {
        "id": uuid.uuid4(),
        "name": "Wanda Maximoff",
        "phone_number": "+639226789012",
        "email": "scarlet.witch@westview.io",
        "password": "chaos_magic_9",
        "hashed_password": get_password_hash("chaos_magic_9"),
    },
    "peter_parker": {
        "id": uuid.uuid4(),
        "name": "Peter Parker",
        "phone_number": "+639237890123",
        "email": "spidey@dailybugle.com",
        "password": "uncle_ben_remembered",
        "hashed_password": get_password_hash("uncle_ben_remembered"),
    },
    "sam_wilson": {
        "id": uuid.uuid4(),
        "name": "Sam Wilson",
        "phone_number": "+639248901234",
        "email": "falcon@airforce.mil",
        "password": "on_your_left",
        "hashed_password": get_password_hash("on_your_left"),
    },
    "carol_danvers": {
        "id": uuid.uuid4(),
        "name": "Carol Danvers",
        "phone_number": "+639259012345",
        "email": "captain.marvel@kree.com",
        "password": "higher_further_faster",
        "hashed_password": get_password_hash("higher_further_faster"),
    },
    "scott_lang": {
        "id": uuid.uuid4(),
        "name": "Scott Lang",
        "phone_number": "+639260123456",
        "email": "antman@xcon.com",
        "password": "orange_slices_pls",
        "hashed_password": get_password_hash("orange_slices_pls"),
    },
}


dummy_data = {
    "id": uuid.uuid4(),
    "name": "test2",
    "phone_number": "+638788667679",
    "email": "test2@test.com",
    "password": "Test_password2",
    "hashed_password": get_password_hash("Test_password2"),
}


sample_invalid_user = {
        'name':"emmanuel",
        'email':"Emmanuel@gmail.com",
        'phone_number':"093985984598",
        'password':"hiworld123"
}



sample_valid_user = {
        'name':"emmanuel",
        'email':"Emmanuel@gmail.com",
        'phone_number':"093985984598",
        'password':"hiWorld123"
}
