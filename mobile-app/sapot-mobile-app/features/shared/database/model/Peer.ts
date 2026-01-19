import { Model } from "@nozbe/watermelondb";
import { date, field } from "@nozbe/watermelondb/decorators";

export default class Peer extends Model {
  static table = "peers";

  @field("username") username!: string;
  @field("is_online") isOnline!: boolean;
}
