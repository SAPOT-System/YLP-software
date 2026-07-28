import { GuestUser, Peer } from "../database";
import { userLog } from "../utils/logger";
userLog.debug("[user-store] module loaded");

type UserStoreListener = () => void;

/**
 * UserStore manages the current user's Peer object.
 */
export class UserStore {
  private _user?: Peer | GuestUser;
  private _isGuest: boolean = false;
  private _isRescuer: boolean = false;
  private _isAdmin: boolean = false;
  private listeners = new Set<UserStoreListener>();

  /**
   * Gets the current user as a Peer object.
   * @throws Error if the user is not initialized
   */
  get user(): Peer | GuestUser {
    if (!this._user) throw new Error("Current user not initialized");
    return this._user;
  }

  /**
   * Whether `user` can be read without throwing. Lets callers that run right
   * after login check for a settled auth state instead of using a throw as
   * control flow.
   */
  get hasUser(): boolean {
    return Boolean(this._user);
  }

  get isGuest(): boolean {
    return this._isGuest;
  }

  get isRescuer(): boolean {
    return this._isRescuer;
  }

  get isAdmin(): boolean {
    return this._isAdmin;
  }

  setIsRescuer(value: boolean) {
    if (this._isRescuer === value) return;
    this._isRescuer = value;
    this.emit();
  }

  setIsAdmin(value: boolean) {
    if (this._isAdmin === value) return;
    this._isAdmin = value;
    this.emit();
  }

  setUser(user: Peer | GuestUser, isGuest: boolean) {
    userLog.info("user › set", { isGuest, hasUser: Boolean(user) });
    this._user = user;
    this._isGuest = isGuest;
    this.emit();
  }

  subscribe(listener: UserStoreListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
