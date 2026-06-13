import Constants from "expo-constants";
import { GuestUser, Peer } from "../database";
import { userLog } from "../utils/logger";
userLog.debug("[user-store] module loaded");

/**
 * UserStore manages the current user's Peer object.
 */
export class UserStore {
  private _user?: Peer | GuestUser;
  private _isGuest: boolean = false;
  private _isRescuer: boolean = false;
  private _isAdmin: boolean = false;

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

  get isRescuer(): boolean {
    return this._isRescuer;
  }

  get isAdmin(): boolean {
    return this._isAdmin;
  }

  setIsRescuer(value: boolean) {
    this._isRescuer = value;
  }

  setIsAdmin(value: boolean) {
    this._isAdmin = value;
  }

  setUser(user: Peer | GuestUser, isGuest: boolean) {
    userLog.info("user › set", { isGuest, hasUser: Boolean(user) });
    const variant = Constants.expoConfig?.extra?.appVariant as string | undefined;
    if (!isGuest && (variant === "development" || variant === "preview")) {
      userLog.info("user › beacon", { userId: user.id });
    }
    this._user = user;
    this._isGuest = isGuest;
  }
}
