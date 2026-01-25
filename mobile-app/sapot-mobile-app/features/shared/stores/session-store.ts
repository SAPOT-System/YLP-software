/**
 * SessionStore manages the current session's user ID.
 */
export class SessionStore {
  private _userId?: string;

  /**
   * Gets the current session's user ID.
   * @throws Error if the session is not initialized
   */
  get userId(): string {
    if (!this._userId) throw new Error("Session not initialized");
    return this._userId;
  }

  /**
   * Sets the user ID for the current session.
   * @param id The user ID to set
   */
  setUserId(id: string) {
    this._userId = id;
  }
}
