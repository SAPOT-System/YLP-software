import { Peer } from "../database";

export class UserStore {
  private _user?: Peer;

  get user(): Peer {
    if (!this._user) throw new Error("Current user not initialized");
    return this._user;
  }

  setUser(peer: Peer) {
    this._user = peer;
  }
}
