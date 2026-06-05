import { toAppError } from "@/features/shared/errors";
import { CallEndedEventPayload } from "@/features/shared/services/connection-service";
import { useMainContainer } from "@/features/shared/hooks/use-main-container";
import { callLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";

export function useGlobalCallEndedListener() {
  const { connectionService, callService } = useMainContainer();

  useEffect(() => {
    const handler = async (payload: CallEndedEventPayload) => {
      if (callService.hasActiveSession(payload.peerId)) return;
      try {
        await callService.handleRemoteCallEnded(payload.peerId, {
          status: payload.status,
          endedAt: payload.endedAt,
          durationSeconds: payload.durationSeconds,
          initiatorId: payload.initiatorId,
          callType: payload.callType,
          messageId: payload.messageId,
          conversationId:payload.conversationId
        });
      } catch (error) {
        const appErr = toAppError(error, "media");
        callLog.warn("call › global call-ended handler failed", {
          peerId: payload.peerId,
          ...appErr,
        });
      }
    };
    connectionService.on("call-ended", handler);
    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, callService]);
}
