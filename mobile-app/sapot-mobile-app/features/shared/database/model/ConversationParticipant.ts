import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";
import Conversation from "./Conversation";
import Peer from "./Peer";

export enum ConversationParticipantRole {
  MEMBER = "member",
  ADMIN = "admin",
}

export default class ConversationParticipant extends Model {
  static table = "conversation_participants";

  @field("role") role!: ConversationParticipantRole;
  @date("joined_at") joinedAt!: Date;
  @field("is_deleted") isDeleted!: boolean;

  @relation("conversations", "conversation")
  conversation!: Relation<Conversation>;
  @relation("peers", "user") user!: Relation<Peer>;
}
