import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";
import baseLogger from "../../utils/logger";
import { Message } from "./Message";
import { Peer } from "./Peer";
import { GuestUser } from "./guest-user";

const modelLog = baseLogger.extend("database");
modelLog.debug("[model] MessageStatus loaded");

// TODO: replace the name for better understanding
export enum MessageStatusType {
  SENDING = "sending",
  SENT = "sent",
  NOT_SENT = "not_sent",
  DELIVERED = "delivered",
  READ = "read",
}

export class MessageStatus extends Model {
  static table = "message_receipts";

  @field("status") status!: MessageStatusType;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;
  @field("is_deleted") isDeleted!: boolean;

  @relation("messages", "message")
  message!: Relation<Message>;
  @relation("peers", "user") user!: Relation<Peer | GuestUser>;
}
