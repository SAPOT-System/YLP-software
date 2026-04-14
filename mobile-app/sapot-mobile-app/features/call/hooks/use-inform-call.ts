import { hookLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import { useCallService } from "./use-call-service";
hookLog.debug("[use-call] module loaded");

export const useInformCall = () => {
  const callService = useCallService();

  const handleCall = async (type: "audio" | "video", peerId: string) => {
    try {
      hookLog.info("[useCall] start", { peerId, type });
      await callService.informPeerForIncomingCall(type, peerId);
      router.push({
        pathname: "/(drawer)/(tabs)/call/[id]",
        params: { id: peerId!, type, status: "calling" },
      });
    } catch (error) {
      hookLog.error("[useCall] failed", { peerId, type, error });
      throw error;
    }
  };

  return handleCall;
};
