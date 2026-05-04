"use client"
import { createConversationParticipant } from "@/lib/actions/conversationParticipant";
import { createConversation } from "@/lib/actions/conversations";
import { createPeer } from "@/lib/actions/peers";
import { ConversationParticipant, db } from "@/lib/db";
import { directConversationId } from "@/lib/directConversationId";
import { collectChanges } from "@/lib/sync/collectChanges";
import { addMutation } from "@/lib/sync/mutationQueue";
import { pull, push, sync } from "@/lib/sync/syncEngine";
import { useEffect, useRef, useState } from "react";


export function usePolling(callback: () => Promise<void>, interval: number) {
  const isRunning = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (isRunning.current) return; // 🚫 prevent overlap

      isRunning.current = true;

      try {
        await callback();
      } catch (err) {
        console.error("Polling error:", err);
      } finally {
        isRunning.current = false;
      }
    };

    const id = setInterval(tick, interval);

    return () => clearInterval(id);
  }, [callback, interval]);
}





export default function Messages() {
  const [conversations, setConversations] = useState<any[]>([]);
  function refreshConvos(){
    (async () => {
      const convos = await getConversations();
      setConversations(convos);  
    })()
  }

  useEffect(()=>{
    (async ()=>{
      await sync();
      refreshConvos();
    })()
  }, [])
    
  usePolling(async () => {
    const convos = await getConversations();
    setConversations(convos);
  }, 5000);

  usePolling(async () => {
    sync();
  }, 5000);

const [activeConversation, setActiveConversation] = useState<any | null>(null);
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
  
  async function getConversations() {
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

	const peers = await Promise.all(
          otherParticipants.map(async (p) => {
            let peer = await db.peers.get(p.user_id);
            // If peer missing OR username is missing, re-fetch from API
            if (!peer || !peer.username) {
              try {
		const res = await fetch(
                  `/api/search-user/by-id?identifier_string=${p.user_id}`,
                  { method: "POST" }
		);
		const data = await res.json();
		const fetchedUser = data;

		if (fetchedUser) {
                  const peerData = {
                    id: fetchedUser.id,
                    username: "HEHE",
                    first_name: fetchedUser.first_name,
                    last_name: fetchedUser.last_name,
                  };
		  if (fetchedUser) {
		    const peerData = {
		      id: fetchedUser.id,
		      username: fetchedUser.username, // not hardcoded "HEHE"
		      first_name: fetchedUser.first_name,
		      last_name: fetchedUser.last_name,
		    };

		    await db.peers.put(peerData); // put = upsert, overwrites existing record
		    peer = peerData;
		  }
		}
              } catch (err) {
		console.error("Failed to fetch peer:", p.user_id, err);
              }
            }

            return peer ?? null;
          })
	);

	const validPeers = peers.filter(Boolean);
	return {
          ...conv,
          participants: otherParticipants,
          user_ids: otherParticipants.map((p) => p.user_id),
          peers: validPeers,
          peer: validPeers[0] ?? null,
          // Explicitly surface username(s) for easy access
          username: validPeers[0]?.username ?? null,
          usernames: validPeers.map((p) => p.username).filter(Boolean),
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
      conversation_type: "solo",
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
    await push();
    const convos = await getConversations();
    setConversations(convos)
  }
  
  return (
    <div className="flex h-screen bg-gray-100">
    
      {/* LEFT SIDEBAR */}
      <div className="w-1/3 bg-white border-r flex flex-col">
      
	{/* Header */}
	<div className="p-4 text-xl font-semibold border-b">
							      Chats
	</div>

	{/* Search */}
	<div className="p-3 border-b">
          <input
            type="text"
            placeholder="Search users..."
            className="w-full p-2 rounded-lg bg-gray-100 outline-none"
            onChange={async (e) => await search(e.target.value)}
          />
	</div>

	{/* Search Results */}
	{matchedUsers.length > 0 && (
          <div className="border-b max-h-40 overflow-y-auto">
            {matchedUsers.map((user) => (
              <div
		key={user.id}
		onClick={async () => {
		  createConversationIfNotExists(user);
		  await search("");
		  setActiveConversation(conversations.find(item => item.id === directConversationId(userid, user.id)))
		  refreshConvos();
		}}
		
		className="p-3 hover:bg-gray-100 cursor-pointer"
              >
		{user.username}
              </div>
            ))}
          </div>
	)}

	{/* Conversations List */}
	<div className="flex-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => setActiveConversation(conversation)}
              className="p-4 border-b hover:bg-gray-100 cursor-pointer"
            >
              <div className="font-medium">
		{conversation?.peer?.username || "Unknown"}
              </div>
              <div className="text-sm text-gray-500">
						       Click to open chat
              </div>
            </div>
          ))}
	</div>
      </div>

      {/* RIGHT CHAT PANEL */}
      <div className="flex-1 flex flex-col">
      
	{activeConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-white font-semibold">
              {activeConversation?.peer?.username}
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {/* Placeholder messages */}
              <div className="bg-gray-200 p-3 rounded-lg w-fit max-w-xs">
									   Hello 👋
              </div>
              <div className="bg-blue-500 text-white p-3 rounded-lg w-fit max-w-xs ml-auto">
											      Hey!
              </div>
            </div>

            {/* Input */}
            <div className="p-4 border-t bg-white flex items-center gap-2">
              <input
		type="text"
		placeholder="Message..."
		className="flex-1 p-2 rounded-full bg-gray-100 outline-none"
              />
              <button className="bg-blue-500 text-white px-4 py-2 rounded-full">
										  Send
              </button>
            </div>
          </>
	) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
										   Select a conversation
          </div>
	)}
      </div>
    </div>
  );;
}
