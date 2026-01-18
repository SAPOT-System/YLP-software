import { Model } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";

export enum Status {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
}
export default class Message extends Model {
  static table = "messages";

  @field("message") message!: string;
  @field("status") status!: Status;
  @date("created_at") createdAt!: Date;

  @relation("chats", "chat_id") chatId!: string;
  @relation("peers", "sender_id") senderId!: string;
}
