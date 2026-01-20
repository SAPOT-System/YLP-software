import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";
import Peer from "./Peer";
import Conversation from "./Conversation";

export enum MessageType {
  TEXT = "text",
  PHOTO = "photo",
  VIDEO = "video",
  FILE = "file",
}

export default class Message extends Model {
  static table = "messages";

  @field("message_type") messageType!: MessageType;
  @field("content") content!: string;
  @date("created_at") createdAt!: Date;
  @date("edited_at") editedAt!: Date;
  @date("is_deleted") isDeleted!: boolean;

  @relation("conversations", "conversation")
  conversation!: Relation<Conversation>;
  @relation("peers", "sender") sender!: Relation<Peer>;
}
