import uuid from "react-native-uuid";

export function smsConversationId(userIdA: string, userIdB: string): string {
  const name = "sms:" + [userIdA, userIdB].sort().join(":");
  return uuid.v5(name, uuid.URL) as string;
}
