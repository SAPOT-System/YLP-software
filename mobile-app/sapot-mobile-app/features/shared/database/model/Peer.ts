import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";
import { modelLog } from "../../utils/logger";
modelLog.debug("[model] Peer loaded");

export class Peer extends Model {
  static table = "peers";

  @field("username") username!: string;
  @field("first_name") firstName!: string;
  @field("last_name") lastName?: string;

  // Peer-specific fields
  @field("is_online") isOnline!: boolean;
  @field("email") email?: string;
  @field("phone_number") phoneNumber?: string;
  @field("email_verified") emailVerified?: boolean;
  @field("phone_number_verified") phoneNumberVerified?: boolean;
  @field("role") role?: string;
}
