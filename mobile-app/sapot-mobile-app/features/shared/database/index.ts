import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import Conversation from "./model/Conversation";
import ConversationParticipant from "./model/ConversationParticipant";
import Message from "./model/Message";
import migrations from "./model/migrations";
import Peer from "./model/Peer";
import schema from "./model/schema";
import MessageStatus from "./model/MessageStatus";

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true ,
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

export {
  default as Conversation,
  ConversationType,
} from "./model/Conversation";
export {
  default as ConversationParticipant,
  ConversationParticipantRole,
} from "./model/ConversationParticipant";
export { default as Message } from "./model/Message";
export { default as Peer } from "./model/Peer";
export {
  default as MessageStatus,
  MessageStatusType,
} from "./model/MessageStatus";
