import { MessageStatus } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class MessageStatusRepository {
  private messagesCollection: Collection<MessageStatus>;

  constructor(private db: Database) {
    this.messagesCollection = db.get<MessageStatus>(MessageStatus.table);
  }
}
