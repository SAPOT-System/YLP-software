import { IncomingCallData } from "./notification-service";
import { CallMessage } from "../types";
import { CallEndedEventPayload, ConnectionServiceEvents } from "./connection-service";

export interface CallMessageRouterDeps {
  isBusyFor: (peerId: string) => boolean;
  hasActiveCall: (peerId: string) => boolean;
  notify: (data: IncomingCallData) => Promise<void>;
}

type EmitEventName = keyof ConnectionServiceEvents;

export type CallRouterResult =
  | { action: "emit"; eventName: EmitEventName; payload: unknown }
  | { action: "busy-reject"; peerId: string; callType: "audio" | "video"; callId?: string }
  | { action: "glare"; peerId: string; eventName: "audio-call" | "video-call"; eventPayload: unknown }
  | { action: "noop" };

export class CallMessageRouter {
  constructor(private readonly deps: CallMessageRouterDeps) {}

  async handle(message: CallMessage): Promise<CallRouterResult> {
    if (message.type === "audio-call") {
      return this.handleIncomingCall(message.data.from, "audio", message.data);
    }

    if (message.type === "video-call") {
      return this.handleIncomingCall(message.data.from, "video", message.data);
    }

    if (message.type === "call-ended") {
      const payload: CallEndedEventPayload = {
        peerId: message.data.from,
        callId: message.data.callId,
        status: message.data.status,
        endedAt: message.data.endedAt,
        durationSeconds: message.data.durationSeconds,
        initiatorId: message.data.initiatorId,
        callType: message.data.callType,
        messageId: message.data.messageId,
        conversationId: message.data.conversationId,
      };
      return { action: "emit", eventName: "call-ended", payload };
    }

    if (message.type === "call-ready") {
      return { action: "emit", eventName: "call-ready", payload: message.data.from };
    }

    if (message.type === "call-rejected" && message.data.reason === "busy") {
      const payload = {
        peerId: message.data.from,
        callId: message.data.callId ?? "",
        conversationId: message.data.conversationId ?? "",
        messageId: message.data.messageId,
        callType: message.data.callType ?? ("audio" as const),
      };
      return { action: "emit", eventName: "call-busy", payload };
    }

    return { action: "noop" };
  }

  private async handleIncomingCall(
    callerPeerId: string,
    callType: "audio" | "video",
    data: { from: string; callerName: string; conversationId?: string; callId?: string }
  ): Promise<CallRouterResult> {
    if (this.deps.isBusyFor(callerPeerId)) {
      return { action: "busy-reject", peerId: callerPeerId, callType, callId: data.callId };
    }

    const eventName = callType === "audio" ? ("audio-call" as const) : ("video-call" as const);
    const eventPayload = {
      peerId: data.from,
      callerName: data.callerName,
      conversationId: data.conversationId,
      callId: data.callId,
    };

    await this.deps.notify({
      callerId: callerPeerId,
      callType: eventName,
      callerName: data.callerName,
      conversationId: data.conversationId,
    });

    if (this.deps.hasActiveCall(callerPeerId)) {
      return { action: "glare", peerId: callerPeerId, eventName, eventPayload };
    }

    return { action: "emit", eventName, payload: eventPayload };
  }
}
