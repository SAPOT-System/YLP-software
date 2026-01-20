import { Model } from "@nozbe/watermelondb";
import { date, field } from "@nozbe/watermelondb/decorators";

export enum ConversationType {
  DIRECT = "direct",
  GROUP = "group",
}

export default class Conversation extends Model {
  static table = "conversations";

  @field("type") type!: ConversationType;
  @date("created_at") createdAt!: Date;
  @date("is_deleted") isDeleted!: boolean;
}


