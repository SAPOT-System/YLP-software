// features/peers/createPeer.ts

import { db } from "../db";
import { addMutation } from "../sync/mutationQueue";

export async function createPeer({
  id,
  username,
  first_name,
  last_name,
  is_online = false,
  email = null,
  phone_number = null,
  email_verified = null,
}: {
  id: string;
  username: string;
  first_name: string;
  last_name?: string | null;
  is_online?: boolean;
  email?: string | null;
  phone_number?: string | null;
  email_verified?: boolean | null;
}) {
  const record = {
    id,
    username,
    first_name,
    last_name,
    is_online,
    email,
    phone_number,
    email_verified,
  };

  /* =========================
     1. WRITE LOCALLY (OPTIMISTIC)
  ========================= */

  await db.peers.put(record);
}
