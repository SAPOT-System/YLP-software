import { router } from "expo-router";
import { useCallService } from "./use-call-service";

export const useCall = () => {
  const callService = useCallService();

  const handleCall = async (type: "audio" | "video", peerId: string) => {
    callService.informPeerForIncomingCall(type, peerId);
    await callService.startCall(type, peerId);
    router.push({
      pathname: "/(drawer)/(tabs)/call/[id]",
      params: { id: peerId!, type, status: "calling" },
    });
  };

  return handleCall;
};
