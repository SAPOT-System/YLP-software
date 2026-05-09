import { Model } from "@nozbe/watermelondb";
import { date, field } from "@nozbe/watermelondb/decorators";
import { modelLog } from "../../utils/logger";
modelLog.debug("[model] Conversation loaded");

export enum ConversationType {
  DIRECT = "direct",
  GROUP = "group",
}

export class Conversation extends Model {
  static table = "conversations";

  @field("type") type!: ConversationType;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;
  @field("title") title?: string;
  @field("is_deleted") isDeleted!: boolean;
}


