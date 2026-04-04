import { Model } from "@nozbe/watermelondb";
import { date, field } from "@nozbe/watermelondb/decorators";

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
}


