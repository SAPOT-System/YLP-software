import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";
import { IUser } from "../types";

export class Peer extends Model implements IUser {
  static table = "peers";

  @field("username") username!: string;
  @field("first_name") firstName!: string;
  @field("last_name") lastName!: string;

  // Peer-specific fields
  @field("is_online") isOnline!: boolean;
  @field("email") email!: string;
  @field("phone_number") phoneNumber!: string;
}
