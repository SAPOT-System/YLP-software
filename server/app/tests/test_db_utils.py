

from app.db_operations.user_search import search_case_insensitive
from app.db_operations.auth import SessionDep


def test_db_search_user(session: SessionDep):
    res = search_case_insensitive("pet", session)
    data = {'last_name': 'Parker', 'username': 'Peter Parker', 'first_name': 'Peter'}
    assert len(res) == 1
    assert res[0].get('last_name') == data["last_name"]
    assert res[0].get('first_name') == data["first_name"]
    assert res[0].get('username') == data["username"]
