import type { CallService } from "@/features/call/services/call-service";
import type { ConnectionService } from "@/features/shared/connection/services/connection-service";
import { stopForegroundService } from "@/features/shared/hooks/use-foreground-service";
import { callLog, uiLog } from "@/features/shared/core/utils/logger";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

export interface IncomingCallInfo {
  peerId: string;
  callType: "video" | "audio";
  conversationId?: string;
  callId?: string;
  callerName?: string;
}

// Owns the ringing (not-yet-accepted) lifecycle so it survives the incoming-call
// screen being minimized/unmounted, mirroring how useCallLifecycle outlives the
// call room screen once a call is under way.
export function useIncomingCallLifecycle(params: {
  callService: CallService;
  connectionService: ConnectionService;
  incomingCall: IncomingCallInfo | null;
  onIncomingCallEnded: () => void;
}): void {
  const { callService, connectionService, incomingCall, onIncomingCallEnded } = params;

  const onEndedRef = useRef(onIncomingCallEnded);
  onEndedRef.current = onIncomingCallEnded;

  // Mark the peer as busy for concurrent callers while ringing, and release that
  // mark when the ring is over. Left set, it survives as a stale busy marker and
  // the next call from this peer is auto-rejected before the device ever rings.
  useEffect(() => {
    if (!incomingCall) return;
    const { peerId } = incomingCall;
    connectionService.setActiveCall(peerId);
    return () => {
      // Answering also clears the ring, but hands the call to CallService, which
      // now holds a live session and owns the marker until that call ends —
      // releasing it here would un-busy a call that is still up.
      if (callService.hasActiveSession(peerId)) return;
      connectionService.clearActiveCall(peerId);
    };
  }, [incomingCall, connectionService, callService]);

  // No-answer timeout (30s)
  useEffect(() => {
    if (!incomingCall) return;
    const { peerId, callType, conversationId } = incomingCall;
    const timer = setTimeout(async () => {
      callLog.info("[useIncomingCallLifecycle] did not answer", { peerId });
      try {
        await connectionService.dismissIncomingCallNotification();
        await callService.markMissedIncomingCall(callType, peerId, conversationId);
      } catch (error) {
        uiLog.error("[useIncomingCallLifecycle] Error marking missed call", { error });
      }
      onEndedRef.current();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [incomingCall, callService, connectionService]);

  // Caller cancels before we accept
  useEffect(() => {
    if (!incomingCall) return;
    const { peerId } = incomingCall;
    const handler = async (payload: { peerId: string }) => {
      if (payload.peerId !== peerId) return;
      callLog.info("[useIncomingCallLifecycle] caller cancelled", { peerId });
      connectionService.setActiveCall(null);
      await connectionService.dismissIncomingCallNotification();
      try {
        const presented = await Notifications.getPresentedNotificationsAsync();
        for (const n of presented) {
          if (n.request.content.data.type === "incoming_call") {
            await Notifications.dismissNotificationAsync(n.request.identifier);
          }
        }
      } catch {
        // best-effort
      }
      await stopForegroundService();
      onEndedRef.current();
    };
    connectionService.on("call-ended", handler);
    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [incomingCall, connectionService]);
}
