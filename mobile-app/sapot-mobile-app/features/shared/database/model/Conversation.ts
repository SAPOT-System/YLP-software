import { Model } from "@nozbe/watermelondb";
import { date, field } from "@nozbe/watermelondb/decorators";

export enum ChatType {
  DIRECT = "direct",
  GROUP = "group",
}

export default class Chat extends Model {
  static table = "chats";

  @field("type") type!: ChatType;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;
  // @field("name") name!: string;
  // @field("unread_count") unreadCount!: number;
}
