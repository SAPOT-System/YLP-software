import uuid from "react-native-uuid";

export function directConversationId(userIdA: string, userIdB: string): string {
  const name = [userIdA, userIdB].sort().join(":");
  return uuid.v5(name, uuid.URL) as string;
}
