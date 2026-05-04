"use client"
import { createConversationParticipant } from "@/lib/actions/conversationParticipant";
import { createConversation } from "@/lib/actions/conversations";
import { createPeer } from "@/lib/actions/peers";
import { ConversationParticipant, db } from "@/lib/db";
import { directConversationId } from "@/lib/directConversationId";
import { collectChanges } from "@/lib/sync/collectChanges";
import { addMutation } from "@/lib/sync/mutationQueue";
import { pull, push } from "@/lib/sync/syncEngine";
import { useEffect, useState } from "react";



export function usePolling(fetchData: () => Promise<void>, interval = 5000) {
  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      if (isCancelled) return;

      try {
        await fetchData();
      } catch (err) {
        console.error("Polling error", err);
      }

      if (!isCancelled) {
        setTimeout(poll, interval); // schedule next poll
      }
    };

    poll(); // start immediately

    return () => {
      isCancelled = true; // cleanup on unmount
    };
  }, [fetchData, interval]);
}





export default function Messages() {
  const [conversations, setConversations] = useState<any[]>([]);
  usePolling(async () => {
    // await pull();
    // await push();
    const convos = await getConversations();
    setConversations(convos);
  }, 50000);

  const [matchedUsers, setMatchedUsers] = useState<any[]>([]);
  async function search(identifier: string){
    if (identifier === "") {
      setMatchedUsers([]);
      return;
    }
    const fet = await fetch(`/api/search-user?identifier_string=${identifier}`, {method: "POST"});
    const tojson = await fet.json();
    setMatchedUsers(tojson.res || []);
  }

  async function parseIdtoUsername(id: string){
    if (id === "") {
      setMatchedUsers([]);
      return;
    }
    const fet = await fetch(`/api/search-user?identifier_string=${identifier}`, {method: "POST"});
    const tojson = await fet.json();
    return tojson.res[0].username
    }
  
  const [userid, setUserId] = useState<null|string>(null);
  
  async function getConversations(){
    let currentUserId = null;
    if (!userid) {
      const fetchUserID = await fetch("/api/get-current-user");
      const tojson = await fetchUserID.json();
      currentUserId = tojson.id;
      setUserId(currentUserId);
    } else {
      currentUserId = userid;
    }


    const conversations = await db.conversations.toArray();

    const merged = await Promise.all(
      conversations.map(async (conv) => {
	const participants = await db.conversation_participants
	  .where("conversation_id")
	  .equals(conv.id)
	  .toArray();

	// exclude current user
	const otherParticipants = participants.filter(
	  (p) => p.user_id !== currentUserId
	);
	otherParticipants.map(async (user) => {
	  const userExists = await db.peers.get(user.id);
	  if (!userExists){
	    await createPeer({
	      id: user.id,
	      username: user.username,
	      first_name: user.first_name,
	      last_name: user.last_name,
	    });
	  }
	})
	
	// 🔥 fetch peer records
	const peers = await Promise.all(
	  otherParticipants.map((p) => db.peers.get(p.user_id))
	);

	return {
	  ...conv,

	  participants: otherParticipants,

	  // 👇 raw ids (if needed)
	  user_ids: otherParticipants.map((p) => p.user_id),

	  // 👇 FULL peer objects (this is what UI should use)
	  peers: peers.filter(Boolean), // remove undefined

	  // 👇 shortcut for 1:1 chats
	  peer: peers.find(Boolean) ?? null,
	};
      })
    );
  
    return merged;
  }

  async function createConversationIfNotExists(user){
    const userIDB = user.id
    const userExists = await db.peers.get(userIDB);
    if (!userExists){
      await createPeer({
	id: userIDB,
	username: user.username,
	first_name: user.first_name,
	last_name: user.last_name,
      });
    }
    
    let currentUserId = null;
    if (!userid) {
      const fetchUserID = await fetch("/api/get-current-user");
      const tojson = await fetchUserID.json();
      currentUserId = tojson.id;
      setUserId(currentUserId);
    } else {
      currentUserId = userid;
    }

    
    const conversationId = directConversationId(currentUserId, userIDB);

    const record = await db.conversations.get(conversationId);

    if (record) {
      return;
    }
    
    await createConversation({
      id: conversationId,
      conversation_type: "direct",
    });

    await createConversationParticipant({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      user_id: currentUserId,
    });

    await createConversationParticipant({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      user_id: userIDB,
    });
    getConversations();
  }

  
  return (
    <div>
      <div>Chats</div>
      {/* conversations */}
      <input type="text" placeholder="search" className="border border-gray-200 p-3" onChange={async (e)=> await search(e.target.value)}/>
      <div>
	{ conversations.map((conversation) => {
	  return <div key={conversation.id}>{ JSON.stringify(conversation?.peer?.username) ?? "undefined" }</div>
	})}
      </div>
      <div>
	{ matchedUsers.map((user) => {
	  return <div key={user.id} onClick={()=>{createConversationIfNotExists(user)}}>{ user.username }</div>
	})}
      </div>
    </div>
  );
}
