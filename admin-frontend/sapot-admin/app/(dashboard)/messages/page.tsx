"use client"
import { db } from "@/lib/db";
import { collectChanges } from "@/lib/sync/collectChanges";
import { addMutation } from "@/lib/sync/mutationQueue";
import { pull, push } from "@/lib/sync/syncEngine";
import { useEffect } from "react";

async function testPull() {
  console.log("Before pull:", await db.messages.toArray());

  await pull();

  const messages = await db.messages.toArray();
  console.log("After pull:", messages);

  const conversations = await db.conversations.toArray();
  console.log("Conversations:", conversations);

  const msgId = crypto.randomUUID();

  // await db.messages.add({
  //   id: msgId,
  //   conversation: "test-conv",
  //   sender: "test-user",
  //   message_type: "text",
  //   content: "🔥 PUSH TEST MESSAGE",
  //   created_at: Date.now(),
  //   updated_at: Date.now(),
  //   is_deleted: false,
  // });

  // addMutation({
  //   table: "messages",
  //   type: "create",
  //   payload: {
  //     id: msgId,
  //     conversation: "test-conv",
  //     sender: "test-user",
  //     message_type: "text",
  //     content: "🔥 PUSH TEST MESSAGE",
  //     created_at: Date.now(),
  //     updated_at: Date.now(),
  //     is_deleted: false,
  //   },
  // });

  // console.log("🟡 Local message created:", msgId);
  console.log("changes before", collectChanges());
  await push();
  console.log("changes after", collectChanges());
}

testPull();

export default function Messages() {
  useEffect(()=>{
    testPull();    
  }, [])
  return (
    <div>
      <div>Chats</div>
    </div>
  );
}
