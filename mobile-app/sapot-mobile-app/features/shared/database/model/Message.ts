import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";
import baseLogger from "../../utils/logger";
import { Conversation } from "./Conversation";
import { GuestUser } from "./guest-user";
import { Peer } from "./Peer";

const modelLog = baseLogger.extend("database");
modelLog.debug("[model] Message loaded");

export enum MessageType {
  TEXT = "text",
  PHOTO = "photo",
  VIDEO = "video",
  FILE = "file",
}

export class Message extends Model {
  static table = "messages";

  @field("message_type") messageType!: MessageType;
  @field("content") content!: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;
  @field("is_deleted") isDeleted!: boolean;

  @relation("conversations", "conversation")
  conversation!: Relation<Conversation>;
  @relation("peers", "sender") sender!: Relation<GuestUser | Peer>;
}
