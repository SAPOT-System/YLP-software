import { toAppError } from "@/features/shared/errors";
import { useMediaPermissions } from "@/features/shared/hooks/use-media-permissions";
import { hookLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import { useCallService } from "./use-call-service";
hookLog.debug("[use-call] module loaded");

export const useInformCall = () => {
  const callService = useCallService();
  const { requestMediaPermissions } = useMediaPermissions();

  const handleCall = async (type: "audio" | "video", peerId: string) => {
    hookLog.info("[useCall] start", { peerId, type });
    const granted = await requestMediaPermissions(type);
    if (!granted) return;

    router.push({
      pathname: "/(drawer)/(tabs)/call/[id]",
      params: { id: peerId, type, status: "calling" },
    });
    try {
      await callService.informPeerForIncomingCall(type, peerId);
    } catch (error) {
      const appErr = toAppError(error, "media");
      hookLog.error("[useCall] informPeer failed", { peerId, type, ...appErr });
    }
  };

  return handleCall;
};
