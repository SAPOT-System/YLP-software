import { Model, Relation } from "@nozbe/watermelondb";
import { field, relation } from "@nozbe/watermelondb/decorators";
import { Peer } from "./Peer";
import { Message } from "./Message";

// TODO: replace the name for better understanding
export enum MessageStatusType {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
}

export class MessageStatus extends Model {
  static table = "message_status";

  @field("status") status!: MessageStatusType;

  @relation("messages", "message")
  message!: Relation<Message>;
  @relation("peers", "user") user!: Relation<Peer>;
}
