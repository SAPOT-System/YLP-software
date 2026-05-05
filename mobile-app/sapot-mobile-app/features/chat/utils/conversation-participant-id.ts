import uuid from "react-native-uuid";

export function conversationParticipantId(conversationId: string, userId: string): string {
  return uuid.v5(`${conversationId}:${userId}`, uuid.URL) as string;
}
