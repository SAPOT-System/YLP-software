export class UserStore {
  private _username?: string;

  get username(): string {
    if (!this._username) throw new Error("Username not initialized");
    return this._username;
  }

  setUsername(name: string) {
    this._username = name;
  }
}
