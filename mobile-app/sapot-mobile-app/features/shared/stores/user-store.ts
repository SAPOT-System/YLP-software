import { Peer } from "../database";

/**
 * UserStore manages the current user's Peer object.
 */
export class UserStore {
  private _user?: Peer;

  /**
   * Gets the current user as a Peer object.
   * @throws Error if the user is not initialized
   */
  get user(): Peer {
    if (!this._user) throw new Error("Current user not initialized");
    return this._user;
  }

  /**
   * Sets the current user as a Peer object.
   * @param peer The Peer object to set as the current user
   */
  setUser(peer: Peer) {
    this._user = peer;
  }
}
