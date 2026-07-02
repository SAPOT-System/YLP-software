import { Model, Relation } from "@nozbe/watermelondb";
import { date, field, relation } from "@nozbe/watermelondb/decorators";

import { modelLog } from "../../utils/logger";
import { Conversation } from "./Conversation";
import { GuestUser } from "./guest-user";
import { Peer } from "./Peer";
modelLog.debug("[model] Call loaded");

export enum CallType {
  AUDIO = "audio",
  VIDEO = "video",
}

export enum CallStatus {
  INITIATING = "initiating",
  MISSED = "missed",
  COMPLETED = "completed",
  REJECTED = "rejected",
  BUSY = "busy",
}

export class Call extends Model {
  static table = "calls";

  @field("call_type") callType!: CallType;
  @field("status") status!: CallStatus;
  @date("start_time") startTime!: Date;
  @date("end_time") endTime?: Date;
  @date("updated_at") updatedAt!: Date;
  @date("created_at") createdAt!: Date;
  @field("is_deleted") isDeleted!: boolean;

  @relation("conversations", "conversation")
  conversation!: Relation<Conversation>;
  @relation("peers", "initiator") initiator!: Relation<Peer | GuestUser>;
}
