import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

export default class Peer extends Model {
  static table = "peers";

  @field("username") username!: string;
  @field("port") port!: number;
  @field("ip_address") ip_address!: string;
}
