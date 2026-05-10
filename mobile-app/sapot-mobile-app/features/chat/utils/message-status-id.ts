import uuid from "react-native-uuid";

export function messageStatusId(messageId: string, userId: string): string {
  return uuid.v5(`${messageId}:${userId}`, uuid.URL) as string;
}
