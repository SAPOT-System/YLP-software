import uuid from "react-native-uuid";

export function callParticipantId(callId: string, userId: string): string {
  return uuid.v5(`${callId}:${userId}`, uuid.URL) as string;
}
