from app.models.users import User
from app.models.conversation import ConversationParticipant, Conversation
from app.models.message import Message
from app.models.call import Call
from app.models.call_participant import CallParticipant
from app.models.message_receipt import MessageReceipt
from app.models.attachment import Attachment
from app.models.jti import BlacklistedToken
from app.models.user_profile_picture import UserProfilePicture
from app.models.location import UserLocation
from app.models.rescuer import Rescuer
from app.models.admin import Admin
from app.models.websocketComms import MessageData
from app.models.queued import Queue
from app.models.activity import UserActivity, ActivityLog
# from app.models.email_verification import EmailVerification
from app.models.banned_user import BannedUser
from app.models.guest import Guest
from app.models.announcement import Announcement
from app.models.phone_verification import PhoneVerification, PhoneVerified
from app.models.captive_portal import GuestSession
from app.models.router import RouterHealth, InterfaceTraffic

# Models below are used by their respective app.api / app.db_operations modules
# but were not previously registered here. Alembic autogenerate (and any code
# path relying on SQLModel.metadata, e.g. create_all) needs every table model
# imported from a single place so its metadata is populated before use.
from app.models.device_key import DeviceKey
# from app.models.devices import Device  # dead code: unused elsewhere, and its
# `id` field is missing `primary_key=True` so SQLAlchemy cannot even map it.
from app.models.email_recovery_token import EmailRecoveryToken
from app.models.login_attempt import LoginAttempt, RecoveryAttempt
from app.models.PasswordResetCode import PasswordResetCode
from app.models.peer_key import PeerKey, ContactKey
from app.models.PhonePasswordResetCode import PhonePasswordResetCode
from app.models.recovery import RecoveryKey
from app.models.recovery_session import RecoverySession
from app.models.securityQuestions import UserSecurityQuestion
from app.models.token import PasswordResetToken
from app.models.wrapped_key import WrappedKey
from app.models.wrapped_key_recovery import WrappedKeyRecovery
