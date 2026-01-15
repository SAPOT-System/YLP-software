export class SessionStore {
  private _userId?: string;

  get userId(): string {
    if (!this._userId) throw new Error("Session not initialized");
    return this._userId;
  }

  setUserId(id: string) {
    this._userId = id;
  }
}
