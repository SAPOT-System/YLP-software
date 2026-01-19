import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";
import Chat from "./Chat";
import Peer from "./Peer";

export enum MessageStatus {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
}
export default class Message extends Model {
  static table = "messages";

  @field("message") message!: string;
  @field("status") status!: MessageStatus;
  @date("created_at") createdAt!: Date;

  @relation("chats", "chat") chat!: Relation<Chat>;
  @relation("peers", "sender") sender!: Relation<Peer>;
}
