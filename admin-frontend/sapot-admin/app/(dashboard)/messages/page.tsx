"use client"
import { createConversationParticipant } from "@/lib/actions/conversationParticipant";
import { createConversation } from "@/lib/actions/conversations";
import { createPeer } from "@/lib/actions/peers";
import { db } from "@/lib/db";
import { directConversationId } from "@/lib/directConversationId";
import { clearSessionData } from "@/lib/sync/collectChanges";
import { push, sync } from "@/lib/sync/syncEngine";
import { connectWebSocket } from "@/lib/ws/Websocketmanager";
import { onMessage, sendChatMessage } from "@/lib/ws/Websocketmanager";
import { useEffect, useRef, useState, useCallback } from "react";

export function usePolling(callback: () => Promise<void>, interval: number) {
  const isRunning = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (isRunning.current) return;
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
  const [text, setText] = useState("");
  const [userid, setUserId] = useState<null | string>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<null | any>(null);
  const [activeConversation, setActiveConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [matchedUsers, setMatchedUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Auto-scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationRef = useRef<any>(null);
  // Stable ref for userId so async callbacks always see the latest value
  const userIdRef = useRef<string | null>(null);
  const currentUserInfoRef = useRef<any>(null);

  // Keep refs in sync with state
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    userIdRef.current = userid;
  }, [userid]);

  useEffect(() => {
    currentUserInfoRef.current = currentUserInfo;
  }, [currentUserInfo]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Stable helper to get/cache current user id without relying on state closure
  async function ensureCurrentUser() {
    if (userIdRef.current && currentUserInfoRef.current) {
      return { id: userIdRef.current, ...currentUserInfoRef.current };
    }
    const res = await fetch("/api/get-current-user");
    const data = await res.json();
    setUserId(data.id);
    setCurrentUserInfo(data);
    userIdRef.current = data.id;
    currentUserInfoRef.current = data;
    return data;
  }

  function refreshConvos() {
    (async () => {
      const convos = await getConversations();
      setConversations(convos);
    })();
  }

  async function handleSend() {
    if (!text.trim() || !activeConversation) return;

    const user = await ensureCurrentUser();
    const messageText = text;
    setText("");

    // sendChatMessage writes to Dexie synchronously before sending over WS,
    // so loadMessages immediately after will include the new message.
    await sendChatMessage({
      conversationId: activeConversation.id,
      to: activeConversation.peer.id,
      message: messageText,
      senderProfile: {
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });

    await loadMessages(activeConversation.id);
    refreshConvos();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
  useEffect(()=>{
    (async ()=> {
      refreshConvos()
      await sync()
    }
    )()
  }, [])
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const user = await ensureCurrentUser();
      await connectWebSocket(user.id);

      // Sync first to get latest data from server
      try { await sync(); } catch (e) { console.warn("sync error", e); }

      // After sync, applyChanges doesn't write peers to Dexie (it's not in its
      // transaction). Force-hydrate all participant peers from the API now.
      await hydratePeers(user.id);

      const convos = await getConversations();
      setConversations(convos);

      unsubscribe = onMessage(async (msg) => {
        if (msg.type === "chat") {
          const current = activeConversationRef.current;
          if (msg.data.conversationId === current?.id) {
            await loadMessages(msg.data.conversationId);
          }
          const updated = await getConversations();
          setConversations(updated);
        }
        if (msg.type === "ack" || msg.type === "seen") {
          const updated = await getConversations();
          setConversations(updated);
        }
      });
    })();

    return () => { unsubscribe?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Force-fetch and cache all peers for conversations we don't have locally.
  // Needed because applyChanges doesn't include db.peers in its transaction.
  async function hydratePeers(currentUserId: string) {
    const participants = await db.conversation_participants.toArray();
    const otherIds = [...new Set(
      participants
        .filter((p) => p.user_id !== currentUserId)
        .map((p) => p.user_id)
    )];

    await Promise.all(
      otherIds.map(async (id) => {
        const existing = await db.peers.get(id);
        if (existing?.username) return; // already have good data
        try {
          const res = await fetch(`/api/search-user/by-id?identifier_string=${id}`, { method: "POST" });
          const fetched = await res.json();
          if (fetched?.id) {
            await db.peers.put({
              id: fetched.id,
              username: fetched.username,
              first_name: fetched.first_name,
              last_name: fetched.last_name ?? null,
              is_online: false,
              email: null,
              phone_number: null,
              email_verified: null,
            });
          }
        } catch (e) {
          console.warn("hydratePeers: failed for", id, e);
        }
      })
    );
  }

  async function loadMessages(conversationId: string) {
    const msgs = await db.messages
      .where("conversation_id")
      .equals(conversationId)
      .sortBy("created_at");
    setMessages(msgs);
  }

  async function search(identifier: string) {
    setSearchQuery(identifier);
    if (identifier === "") {
      setMatchedUsers([]);
      return;
    }
    const fet = await fetch(`/api/search-user?identifier_string=${identifier}`, { method: "POST" });
    const tojson = await fet.json();
    setMatchedUsers(tojson.res || []);
  }

  async function getConversations() {
    // Always use ref — never stale state closure
    let currentUserId = userIdRef.current;
    if (!currentUserId) {
      const data = await ensureCurrentUser();
      currentUserId = data.id;
    }

    const conversations = await db.conversations.toArray();

    const merged = await Promise.all(
      conversations.map(async (conv) => {
        const participants = await db.conversation_participants
          .where("conversation_id")
          .equals(conv.id)
          .toArray();

        const otherParticipants = participants;//.filter((p) => p.user_id !== currentUserId);

        const peers = await Promise.all(
          otherParticipants.map(async (p) => {
            let peer = await db.peers.get(p.user_id);
            if (!peer || !peer.username) {
              try {
                const res = await fetch(`/api/search-user/by-id?identifier_string=${p.user_id}`, { method: "POST" });
                const fetchedUser = await res.json();
                if (fetchedUser) {
                  const peerData = {
                    id: fetchedUser.id,
                    username: fetchedUser.username,
                    first_name: fetchedUser.first_name,
                    last_name: fetchedUser.last_name,
                  };
                  await db.peers.put(peerData);
                  peer = peerData;
                }
              } catch (err) {
                console.error("Failed to fetch peer:", p.user_id, err);
              }
            }
            return peer ?? null;
          })
        );

        // Get latest message for sorting
        const latestMsg = await db.messages
          .where("conversation_id")
          .equals(conv.id)
          .sortBy("created_at")
          .then((msgs) => msgs[msgs.length - 1] ?? null);

        const validPeers = peers.filter(Boolean);
	const primaryPeer = validPeers.find((p) => p.id !== currentUserId) ?? validPeers[0] ?? null;

	return {
	  ...conv,
	  participants: otherParticipants,
	  user_ids: otherParticipants.map((p) => p.user_id),
	  peers: validPeers,
	  peer: primaryPeer,
	  username: primaryPeer?.username ?? null,
	  usernames: validPeers.map((p) => p.username).filter(Boolean),
	  latestMessage: latestMsg,
	  latestAt: latestMsg?.created_at ?? conv.created_at ?? 0,
	};
      })
    );

    // Sort by latest message descending
    return merged.sort((a, b) => b.latestAt - a.latestAt);
  }

  async function createConversationIfNotExists(user: any) {
    const userIDB = user.id;
    const userExists = await db.peers.get(userIDB);
    if (!userExists) {
      await createPeer({
        id: userIDB,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
      });
    }

    const currentUser = await ensureCurrentUser();
    const currentUserId = currentUser.id;

    const conversationId = directConversationId(currentUserId, userIDB);
    const record = await db.conversations.get(conversationId);

    if (!record) {
      await createConversation({ id: conversationId, conversation_type: "solo" });
      await createConversationParticipant({ id: crypto.randomUUID(), conversation_id: conversationId, user_id: currentUserId });
      await createConversationParticipant({ id: crypto.randomUUID(), conversation_id: conversationId, user_id: userIDB });
      await push();
    }

    const convos = await getConversations();
    setConversations(convos);
    const target = convos.find((item) => item.id === conversationId);
    if (target) {
      setActiveConversation(target);
      await loadMessages(target.id);
    }
  }

  function formatTime(ts: number) {
    if (!ts) return "";
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">

      {/* LEFT SIDEBAR */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Messages</h1>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100 relative">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              placeholder="Search users..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-gray-100 outline-none text-gray-800 placeholder-gray-400 focus:bg-gray-200 transition-colors"
              onChange={async (e) => await search(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setMatchedUsers([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {matchedUsers.length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-10 overflow-hidden">
              <div className="py-1">
                {matchedUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={async () => {
                      await createConversationIfNotExists(user);
                      setSearchQuery("");
                      setMatchedUsers([]);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold shrink-0">
                      {user.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{user.username}</div>
                      {(user.first_name || user.last_name) && (
                        <div className="text-xs text-gray-500">{[user.first_name, user.last_name].filter(Boolean).join(" ")}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No conversations yet</div>
          ) : (
            conversations.map((conversation) => {
              const isActive = activeConversation?.id === conversation.id;
              const name = conversation?.peer?.username || "Unknown";
              const preview = conversation.latestMessage?.content ?? "No messages yet";
              const time = formatTime(conversation.latestAt);

              return (
                <button
                  key={conversation.id}
                  onClick={async () => {
                    setActiveConversation(conversation);
                    await loadMessages(conversation.id);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left transition-colors ${
                    isActive ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    isActive ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-600"
                  }`}>
                    {name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${isActive ? "text-blue-700" : "text-gray-900"}`}>
                        {name}
                      </span>
                      {time && <span className="text-xs text-gray-400 shrink-0">{time}</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{preview}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT CHAT PANEL */}
      <div className="flex-1 flex flex-col min-w-0">

        {activeConversation ? (
          <>
            {/* Chat Header */}
            <div className="px-5 py-3.5 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold">
                {activeConversation?.peer?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{activeConversation?.peer?.username}</div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  No messages yet. Say hi!
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_id === userIdRef.current;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                          isMine
                            ? "bg-blue-500 text-white rounded-br-sm"
                            : "bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={text}
                  placeholder="Message..."
                  className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 outline-none text-sm text-gray-800 placeholder-gray-400 focus:bg-gray-200 transition-colors"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim()}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <svg className="w-4 h-4 text-white translate-x-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Select a conversation</p>
              <p className="text-xs text-gray-400 mt-0.5">or search for someone to message</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
