import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import uuid from "react-native-uuid";
import migrations from "./migrations";
import {
  Call,
  CallParticipant,
  Conversation,
  ConversationParticipant,
  GuestUser,
  Message,
  MessageStatus,
  Peer,
} from "./model";
import schema from "./schema";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  // jsi: true,
  onSetUpError: (_error) => {
    // Database failed to load -- offer the user to reload the app or log out
  },
});

setGenerator(() => uuid.v4());

export const database = new Database({
  adapter,
  modelClasses: [
    Peer,
    Message,
    ConversationParticipant,
    Conversation,
    MessageStatus,
    GuestUser,
    Call,
    CallParticipant,
  ],
});
