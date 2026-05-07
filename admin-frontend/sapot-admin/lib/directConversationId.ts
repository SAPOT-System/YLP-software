// utils/directConversationId.ts

import { v5 as uuidv5 } from "uuid";

// You can use a constant namespace (must be a valid UUID)
const NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"; // same as uuid.URL

export function directConversationId(userIdA: string, userIdB: string): string {
  const name = [userIdA, userIdB].sort().join(":");
  return uuidv5(name, NAMESPACE) as string;
}
