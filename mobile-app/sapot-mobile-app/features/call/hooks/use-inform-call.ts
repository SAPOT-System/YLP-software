import { hookLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import { useCallService } from "./use-call-service";
hookLog.debug("[use-call] module loaded");

export const useInformCall = () => {
  const callService = useCallService();

  const handleCall = async (type: "audio" | "video", peerId: string) => {
    hookLog.info("[useCall] start", { peerId, type });
    router.push({
      pathname: "/(drawer)/(tabs)/call/[id]",
      params: { id: peerId, type, status: "calling" },
    });
    try {
      await callService.informPeerForIncomingCall(type, peerId);
    } catch (error) {
      hookLog.error("[useCall] informPeer failed", { peerId, type, error });
    }
  };

  return handleCall;
};
