import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";
import baseLogger from "../../utils/logger";

const modelLog = baseLogger.extend("database");
modelLog.debug("[model] GuestUser loaded");

export class GuestUser extends Model {
  static table = "guest_user";

  @field("first_name") firstName!: string;
  @field("last_name") lastName!: string;
  @field("username") username!: string;
  get id(): string {
    return this._raw.id;
  }
}
