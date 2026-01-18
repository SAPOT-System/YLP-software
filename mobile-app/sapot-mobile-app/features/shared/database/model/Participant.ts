import { Model } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";

export enum ParticipantRole {
  MEMBER = "member",
  ADMIN = "admin",
}
export default class Participant extends Model {
  static table = "participants";

  @field("role") role!: ParticipantRole;
  @date("joined_at") joinedAt!: Date;
  @date("created_at") createdAt!: Date;

  @relation("chats", "chat_id") chatId!: string;
  @relation("peers", "peer_id") peerId!: string;
}
