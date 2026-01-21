import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import migrations from "./migrations";
import schema from "./schema";
import {
  Peer,
  Message,
  ConversationParticipant,
  Conversation,
  MessageStatus,
} from "./model";

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error) => {
    // Database failed to load -- offer the user to reload the app or log out
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Peer,
    Message,
    ConversationParticipant,
    Conversation,
    MessageStatus,
  ],
});
