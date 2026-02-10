import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

export class Peer extends Model {
  static table = "peers";

  @field("username") username!: string;
  @field("is_online") isOnline!: boolean;
}
