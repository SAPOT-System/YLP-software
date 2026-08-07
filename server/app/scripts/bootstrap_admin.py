"""Create the first administrator from a JSON payload read only from stdin."""
import argparse
import json
import sys

from pydantic import ValidationError
from sqlmodel import Session, select

from app.api.admin import makeAdmin
from app.db_operations.auth import db_create_user, engine
from app.models.admin import Admin
from app.models.users import BootstrapAdminCreate, User

SUCCESS = 0
CORRECTABLE = 2
SYSTEM_FAILURE = 3


def status(session: Session) -> str:
    admins = session.exec(select(User).join(Admin, Admin.user_id == User.id)).all()
    if not admins:
        return "missing"
    return "pending-password-change" if any(admin.must_change_password for admin in admins) else "configured"


def print_validation(error: ValidationError) -> None:
    print(json.dumps({"errors": [{"field": ".".join(map(str, item["loc"])), "message": item["msg"]} for item in error.errors()]}))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args()
    try:
        with Session(engine) as session:
            existing = session.exec(select(Admin)).first()
            if args.status:
                print(json.dumps({"status": status(session)}))
                return SUCCESS
            if existing:
                print(json.dumps({"status": "skipped", "message": "An admin account already exists; bootstrap skipped."}))
                return SUCCESS
            try:
                payload = json.load(sys.stdin)
                user_data = BootstrapAdminCreate.model_validate(payload)
            except (json.JSONDecodeError, ValidationError) as error:
                if isinstance(error, ValidationError):
                    print_validation(error)
                else:
                    print(json.dumps({"errors": [{"field": "payload", "message": "Invalid JSON input"}]}))
                return CORRECTABLE
            user = db_create_user(user_data, session)
            user.must_change_password = True
            session.add(user)
            session.commit()
            makeAdmin(user, session)
            print(json.dumps({"status": "created"}))
            return SUCCESS
    except Exception:
        # Do not expose database details or credentials through an operator terminal.
        print(json.dumps({"error": "Unable to bootstrap the admin account"}), file=sys.stderr)
        return SYSTEM_FAILURE


if __name__ == "__main__":
    raise SystemExit(main())
