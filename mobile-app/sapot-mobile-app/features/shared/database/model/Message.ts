import { Model } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";

export default class Message extends Model {
  static table = "messages";

  @relation("peers", "peer_id") peer_id!: string;
  @field("message") message!: string;
  @date("timestamp") timestamp!: Date;
}
