import { GuestUser, Peer } from "../database";
import baseLogger from "../utils/logger";

const userLog = baseLogger.extend("user");
userLog.debug("[user-store] module loaded");

/**
 * UserStore manages the current user's Peer object.
 */
export class UserStore {
  private _user?: Peer | GuestUser;
  private _isGuest: boolean = false;

  /**
   * Gets the current user as a Peer object.
   * @throws Error if the user is not initialized
   */
  get user(): Peer | GuestUser {
    if (!this._user) throw new Error("Current user not initialized");
    return this._user;
  }

  get isGuest(): boolean {
    return this._isGuest;
  }

  setUser(user: Peer | GuestUser, isGuest: boolean) {
    userLog.info("user › set", { isGuest, hasUser: Boolean(user) });
    this._user = user;
    this._isGuest = isGuest;
  }
}
