import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";
import { IUser } from "../types";

export class GuestUser extends Model implements IUser {
  static table = "guest_user";

  @field("first_name") firstName!: string;
  @field("last_name") lastName!: string;
  @field("username") username!: string;
  get id(): string {
    return this._raw.id;
  }
}
