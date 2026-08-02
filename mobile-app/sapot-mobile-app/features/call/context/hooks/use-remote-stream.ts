import type { CallService } from "@/features/call/services/call-service";
import { callLog, hookLog, uiLog } from "@/features/shared/core/utils/logger";
import { useCallback, useEffect, useRef, useState } from "react";
import { MediaStream } from "react-native-webrtc";
import type { CallState } from "./use-call-lifecycle";

hookLog.debug("[use-remote-stream] module loaded");

export function useRemoteStream(params: {
  callService: CallService;
  callState: CallState;
  peerId: string | null;
  onConnected: () => void;
}): {
  remoteStreamUrl: string | undefined;
  remoteStreamVersion: number;
  ready: boolean;
  resetRemoteStream: () => void;
} {
  const { callService, callState, peerId, onConnected } = params;
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | undefined>();
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);
  const [ready, setReady] = useState(false);

  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    const handler = (stream: MediaStream) => {
      uiLog.info("[CallContext] remote stream received");
      remoteStreamRef.current = stream;
      setRemoteStreamUrl(stream.toURL());
      onConnectedRef.current();
      setRemoteStreamVersion((v) => v + 1);
    };
    callService.on("remoteStream", handler);
    return () => {
      callService.off("remoteStream", handler);
    };
  }, [callService]);

  // ready flag (small delay to let RTCView settle) — matches original behavior
  useEffect(() => {
    if (remoteStreamRef) {
      const timer = setTimeout(() => setReady(true), 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // periodic remote stream health log (debug) — only while connected
  useEffect(() => {
    if (!peerId) return;
    if (callState !== "connected") return;
    const interval = setInterval(() => {
      callLog.debug("[CallContext] remote stream health", {
        hasRemoteStream: !!remoteStreamRef.current,
        streamId: remoteStreamRef.current?.id,
        trackCount: remoteStreamRef.current?.getTracks().length,
        streamUrl: remoteStreamRef.current?.toURL(),
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [peerId, callState]);

  // `remoteStream` is edge-triggered and never replayed, but the callee's
  // answerCall() completes before it navigates to the call room — so the stream
  // can land before the room mounts and calls resetCallState. Re-read whatever
  // the service is holding instead of discarding it, otherwise a live call is
  // pinned on "calling" with no video until the 30s no-answer timeout ends it.
  const resetRemoteStream = useCallback(() => {
    const liveStream = callService.getRemoteStream();
    if (liveStream) {
      uiLog.info("[CallContext] adopting remote stream that arrived pre-mount");
      remoteStreamRef.current = liveStream;
      setRemoteStreamUrl(liveStream.toURL());
      setRemoteStreamVersion((v) => v + 1);
      setReady(true);
      onConnectedRef.current();
      return;
    }
    remoteStreamRef.current = null;
    setRemoteStreamUrl(undefined);
    setReady(false);
  }, [callService]);

  return { remoteStreamUrl, remoteStreamVersion, ready, resetRemoteStream };
}
