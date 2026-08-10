"""Reset an administrator password from stdin JSON without leaking credentials."""
import argparse
import json
import sys

from sqlmodel import Session, select

from app.db_operations.auth import engine, set_user_password
from app.models.admin import Admin
from app.models.users import User

SUCCESS = 0
CORRECTABLE = 2
SYSTEM_FAILURE = 3


def find_admin(session: Session, username: str) -> User | None:
    return session.exec(select(User).join(Admin, Admin.user_id == User.id).where(User.username == username)).first()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lookup", action="store_true")
    args = parser.parse_args()
    try:
        payload = json.load(sys.stdin)
        username = payload.get("username")
        if not isinstance(username, str) or not username:
            print(json.dumps({"error": "username is required"}))
            return CORRECTABLE
        with Session(engine) as session:
            user = find_admin(session, username)
            if not user:
                print(json.dumps({"error": "No administrator matches that username"}))
                return CORRECTABLE
            if args.lookup:
                print(json.dumps({"full_name": f"{user.first_name} {user.last_name}"}))
                return SUCCESS
            password = payload.get("password")
            if not isinstance(password, str):
                print(json.dumps({"error": "password is required"}))
                return CORRECTABLE
            try:
                set_user_password(user, password, session)
            except ValueError as error:
                print(json.dumps({"error": str(error)}))
                return CORRECTABLE
            user.must_change_password = True
            session.add(user)
            session.commit()
            print(json.dumps({"status": "reset"}))
            return SUCCESS
    except (json.JSONDecodeError, OSError):
        print(json.dumps({"error": "Invalid JSON input"}))
        return CORRECTABLE
    except Exception:
        print(json.dumps({"error": "Unable to reset the administrator password"}), file=sys.stderr)
        return SYSTEM_FAILURE


if __name__ == "__main__":
    raise SystemExit(main())
