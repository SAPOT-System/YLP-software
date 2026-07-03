import type { CallService } from "@/features/call/services/call-service";
import type {
  CallEndedEventPayload,
  ConnectionService,
} from "@/features/shared/connection/services/connection-service";
import { callLog, hookLog, uiLog } from "@/features/shared/core/utils/logger";
import React, { useCallback, useEffect, useRef, useState } from "react";

hookLog.debug("[use-call-lifecycle] module loaded");

export type CallState =
  | "calling" | "answering" | "connected"
  | "reconnecting" | "ended" | "no-answer" | "busy" | "rejected";

export function useCallLifecycle(params: {
  callService: CallService;
  connectionService: ConnectionService;
  peerId: string | null;
  callType: "video" | "audio" | null;
  isMinimized: boolean;
  onCallEnded: () => void;
}): {
  callState: CallState;
  setCallState: React.Dispatch<React.SetStateAction<CallState>>;
  terminate: (force?: boolean, reason?: "completed" | "missed" | "rejected") => Promise<void>;
  resetTerminated: () => void;
  resetLifecycle: () => void;
} {
  const { callService, connectionService, peerId, callType, isMinimized, onCallEnded } = params;

  const [callState, setCallState] = useState<CallState>("calling");
  const hasTerminated = useRef(false);
  const wasRejected = useRef(false);

  const onCallEndedRef = useRef(onCallEnded);
  onCallEndedRef.current = onCallEnded;

  const terminate = useCallback(
    async (force = false, reason?: "completed" | "missed" | "rejected") => {
      uiLog.debug("[CallContext] terminate called", { force, isMinimized, reason });
      if (hasTerminated.current) return;
      if (isMinimized && !force) {
        uiLog.debug("[CallContext] skipping terminate — call is minimized");
        return;
      }
      hasTerminated.current = true;
      try {
        await callService.terminateCallConnection(peerId as string, reason);
      } catch (error) {
        uiLog.error("[CallContext] Error in terminate", { error });
      }
    },
    [callService, peerId, isMinimized]
  );

  // call-ready + call-busy
  useEffect(() => {
    if (!peerId || !callType) return;
    const callReadyHandler = (incomingPeerId: string) => {
      if (incomingPeerId !== peerId) return;
      callLog.info("[CallContext] Starting call");
      callService.startCall(callType, peerId);
    };
    const callBusyHandler = (incomingPeerId: string) => {
      if (incomingPeerId !== peerId) return;
      if (connectionService.shouldIgnoreCallBusy(incomingPeerId)) return;
      callLog.info("[CallContext] peer is busy", { peerId });
      setCallState("busy");
    };
    connectionService.on("call-ready", callReadyHandler);
    connectionService.on("call-busy", callBusyHandler);
    return () => {
      connectionService.off("call-ready", callReadyHandler);
      connectionService.off("call-busy", callBusyHandler);
    };
  }, [callService, connectionService, peerId, callType]);

  // Remote call-rejected (declined) — dedicated UI state, distinct from generic call-ended
  useEffect(() => {
    if (!peerId) return;
    const handler = (payload: { peerId: string }) => {
      if (payload.peerId !== peerId) return;
      callLog.info("[CallContext] call › rejected", { peerId });
      wasRejected.current = true;
      // Mark terminated so a connection drop racing the follow-up call-ended
      // message (e.g. peer-disconnected) can't override this back to "ended".
      hasTerminated.current = true;
      setCallState("rejected");
    };
    connectionService.on("call-rejected", handler);
    return () => {
      connectionService.off("call-rejected", handler);
    };
  }, [connectionService, peerId]);

  // Remote call-ended (stale-callId guard + finalize)
  useEffect(() => {
    const handler = async (payload: CallEndedEventPayload) => {
      if (payload.peerId !== peerId) return;
      const activeCallId = callService.getActiveCallId(peerId);
      if (payload.callId && activeCallId && payload.callId !== activeCallId) {
        callLog.warn("[CallContext] stale call-ended ignored", { payloadCallId: payload.callId, activeCallId });
        return;
      }
      uiLog.info("[CallContext] call › remote ended", { peerId, status: payload.status, initiatorId: payload.initiatorId });
      hasTerminated.current = true;
      try {
        await callService.handleRemoteCallEnded(peerId, {
          status: payload.status,
          endedAt: payload.endedAt,
          durationSeconds: payload.durationSeconds,
          initiatorId: payload.initiatorId,
          callType: payload.callType,
          messageId: payload.messageId,
          conversationId: payload.conversationId,
        });
      } catch (error) {
        uiLog.error("[CallContext] Error in remote finalize", { error });
      }
      // A preceding call-rejected event already set the terminal UI state — don't
      // clobber "rejected" back to the generic "ended" display.
      if (!wasRejected.current) {
        setCallState(payload.status === "missed" ? "no-answer" : "ended");
      }
    };
    connectionService.on("call-ended", handler);
    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, peerId, callService]);

  // Reconnection detection
  useEffect(() => {
    if (!peerId) return;
    const onReconnecting = (id: string) => {
      if (id !== peerId) return;
      callLog.info("[CallContext] call › reconnecting", { peerId });
      setCallState("reconnecting");
    };
    const onPeerReconnected = (id: string) => {
      if (id !== peerId) return;
      setCallState((prev) => (prev !== "reconnecting" ? prev : "connected"));
    };
    const onPeerDisconnected = (id: string) => {
      if (id !== peerId) return;
      if (hasTerminated.current) return;
      callLog.warn("[CallContext] call › peer disconnected — all retries failed", { peerId });
      setTimeout(() => {
        if (hasTerminated.current) return;
        hasTerminated.current = true;
        callService
          .terminateCallConnection(peerId, "missed")
          .catch((err) => uiLog.error("[CallContext] terminate on disconnect failed", { err }));
        setCallState("ended");
      }, 1500);
    };
    connectionService.on("call-reconnecting", onReconnecting);
    connectionService.on("peer-reconnected", onPeerReconnected);
    connectionService.on("peer-disconnected", onPeerDisconnected);
    return () => {
      connectionService.off("call-reconnecting", onReconnecting);
      connectionService.off("peer-reconnected", onPeerReconnected);
      connectionService.off("peer-disconnected", onPeerDisconnected);
    };
  }, [connectionService, peerId, callService]);

  // No-answer timeout (30s)
  useEffect(() => {
    if (callState !== "calling") return;
    const timer = setTimeout(async () => {
      setCallState("no-answer");
      await terminate(true, "missed");
    }, 30_000);
    return () => clearTimeout(timer);
  }, [callState, terminate]);

  // Auto-navigate away on "ended"/"rejected" (3s delay)
  useEffect(() => {
    if (callState !== "ended" && callState !== "rejected") return;
    uiLog.info("[CallContext] call › ended", { peerId, callState });
    const timer = setTimeout(() => {
      onCallEndedRef.current();
    }, 3000);
    return () => clearTimeout(timer);
  }, [callState, peerId]);

  const resetTerminated = useCallback(() => {
    hasTerminated.current = false;
    wasRejected.current = false;
  }, []);
  const resetLifecycle = useCallback(() => {
    setCallState("calling");
    hasTerminated.current = false;
    wasRejected.current = false;
  }, []);

  return { callState, setCallState, terminate, resetTerminated, resetLifecycle };
}
