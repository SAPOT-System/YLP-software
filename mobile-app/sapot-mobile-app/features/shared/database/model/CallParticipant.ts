import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";

import { Call } from "./Call";
import { GuestUser } from "./guest-user";
import { Peer } from "./Peer";

export class CallParticipant extends Model {
  static table = "call_participants";

  @date("joined_at") joinedAt!: Date;
  @date("left_at") leftAt?: Date;
  @date("updated_at") updatedAt!: Date;
  @date("created_at") createdAt!: Date;
  @field("is_deleted") isDeleted!: boolean;

  @relation("calls", "call") call!: Relation<Call>;
  @relation("peers", "user") user!: Relation<Peer | GuestUser>;
}
