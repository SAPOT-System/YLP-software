import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";
import Chat from "./Chat";
import Peer from "./Peer";

export enum ParticipantRole {
  MEMBER = "member",
  ADMIN = "admin",
}
export default class Participant extends Model {
  static table = "participants";

  @field("role") role!: ParticipantRole;
  @date("joined_at") joinedAt!: Date;
  @date("created_at") createdAt!: Date;

  @relation("chats", "chat") chat!: Relation<Chat>;
  @relation("peers", "peer") peer!: Relation<Peer>;
}
