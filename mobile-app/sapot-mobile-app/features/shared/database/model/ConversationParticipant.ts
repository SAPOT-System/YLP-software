import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";
import { Conversation } from "./Conversation";
import { Peer } from "./Peer";
import { GuestUser } from "./guest-user";

export class ConversationParticipant extends Model {
  static table = "conversation_participants";

  @date("joined_at") joinedAt!: Date;
  @field("is_deleted") isDeleted!: boolean;

  @relation("conversations", "conversation")
  conversation!: Relation<Conversation>;
  @relation("peers", "user") user!: Relation<Peer | GuestUser>;
}
