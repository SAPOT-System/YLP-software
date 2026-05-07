import { pull } from "../sync/syncEngine";

let socket: WebSocket | null = null;


function handleWebRTCSignal(msg: any) {
  // purely peer connection logic
  // NO DATABASE, NO SYNC
}

function handleCallEvent(msg: any) {
  // DO NOT TOUCH SYNC ENGINE HERE

  switch (msg.type) {
    case "audio-call":
      // open incoming call UI
      break;

    case "call-ended":
      // update call UI only
      break;
  }
}

async function handleWSMessage(msg: any) {
  switch (msg.type) {
    /**
     * 🔥 MAIN SYNC TRIGGER
     */
    case "sync_required":
      await pull();
      break;

    /**
     * CALL SYSTEM (DO NOT SYNC DB)
     */
    case "audio-call":
    case "video-call":
    case "call-ended":
    case "call-rejected":
    case "call-missed":
    case "call-ready":
      handleCallEvent(msg);
      break;

    /**
     * WEBSOCKET ONLY SIGNALING (NO DB SYNC)
     */
    case "offer":
    case "answer":
    case "ice-candidate":
    case "handshake":
      handleWebRTCSignal(msg);
      break;

    default:
      console.log("Unknown WS event:", msg);
  }
}

export async function connectWebSocket() {
  const fet = await fetch("/api/get-token")
  const tokenjson = fet.json()
  const token = tokenjson.token;

  socket = new WebSocket(`ws://localhost:8000/ws?token=${token}`);

  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    handleMessage(msg);
  };
}

async function handleMessage(msg: any) {
  switch (msg.type) {
    /**
     * ONLY trigger sync when a message arrives
     */
    case "chat":
      await pull();
      break;

    /**
     * OPTIONAL: if backend sends notification of new message
     */
    case "new-message":
      await pull();
      break;

    default:
      // ignore everything else for sync purposes
      break;
  }
}


function handleCall(msg) {
  // show modal, ringtone, etc.
}
