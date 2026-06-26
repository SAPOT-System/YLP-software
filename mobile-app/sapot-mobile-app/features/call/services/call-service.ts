import { ChatService } from "@/features/chat";
import { CallStatus, CallType } from "@/features/shared/database/model/Call";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { GuestUser } from "@/features/shared/database/model/guest-user";
import { Peer } from "@/features/shared/database/model/Peer";
import { ConnectionService } from "@/features/shared/services/connection-service";
import { ConversationKeyManager } from "@/features/shared/services/conversation-key-manager";
import { PeerService } from "@/features/shared/peer/peer-service";
import { UserStore } from "@/features/shared/stores/user-store";
import { toAppError, captureAppError } from "@/features/shared/errors";
import { callLog } from "@/features/shared/utils/logger";
import { TypedEventEmitter } from "@/features/shared/utils/typed-event-emitter";
import InCallManager from "react-native-incall-manager";
import { MediaStream } from "react-native-webrtc";
import { MessageRepository } from "@/features/chat/repositories/message-repository";
import { MessageStatusRepository } from "@/features/chat/repositories/message-status-repository";
import { CallParticipantRepository, CallRepository } from "../repositories";
import { CallAudioService } from "./call-audio-service";
import { CallLogService, CallSession } from "./call-log-service";
callLog.debug("[call-service] module loaded");

export type AudioRouteTypes = "earpiece" | "speaker" | "headset" | "bluetooth";

export type CallServiceEvents = {
  "audio-routes-updated": [
    { routes: { type: AudioRouteTypes; label: string }[] }
  ];
  "audio-route-changed": [
    {
      route: AudioRouteTypes;
      available: { type: AudioRouteTypes; label: string }[];
    }
  ];
  remoteStream: [stream: MediaStream];
  "switch-cam": [stream: MediaStream];
  "local-stream-ready": [peerId: string];
};

type CallConnectionService = Pick<
  ConnectionService,
  | "isWebrtcConnected"
  | "initializeStream"
  | "initializeStreamEarly"
  | "renegotiate"
  | "sendCallMessage"
  | "connectToPeer"
  | "on"
  | "once"
  | "off"
  | "terminateCallConnection"
  | "getWebrtcAdapter"
  | "toggleMic"
  | "toggleCamera"
  | "switchCamera"
  | "getLocalStream"
  | "isWebSocketAllowed"
  | "setActiveCall"
  | "sendCallControlMessage"
  | "waitForDataChannel"
>;

type CallUserStore = {
  user: Pick<UserStore["user"], "id"> & {
    username?: string;
    firstName?: string;
    lastName?: string;
  };
};

type CallPeerService = Pick<
  PeerService,
  "findDiscoveredPeerById" | "getOrCreatePeerById" | "findPeerById"
>;

type CallSyncService = {
  syncNow(): Promise<void>;
};

type CallLogChatService = Pick<
  ChatService,
  | "updateMessageStatus"
  | "acknowledgeIncomingMessage"
> & {
  getOrCreateDirectConversationByPeer(
    peerId: string,
    conversationId?: string
  ): Promise<
    Awaited<ReturnType<ChatService["getOrCreateDirectConversationByPeer"]>>
  >;
};

type RemoteCallEndedPayload = {
  status?: "completed" | "missed" | "rejected";
  endedAt?: number;
  durationSeconds?: number;
  initiatorId?: string;
  callType?: "audio" | "video";
  messageId?: string;
  conversationId?: string;
};


/**
 * CallService manages call connections, including starting/terminating calls, handling streams,
 * and toggling audio/video for peer-to-peer calls. It extends EventEmitter to emit call-related events.
 */
export class CallService extends TypedEventEmitter<CallServiceEvents> {
  private connectedStateByPeer: Map<string, "connected" | "disconnected"> = new Map();
  private audioService: CallAudioService;
  private callSessions: Map<string, CallSession> = new Map();
  private callLog!: CallLogService;
  private busyRejectHandler:
    | ((
        peerId: string,
        payload: {
          callId: string;
          conversationId: string;
          messageId?: string;
          callType: "audio" | "video";
        }
      ) => void)
    | null = null;
  private callReadyHandler: ((peerId: string) => void) | null = null;

  private getConnectedState(peerId: string): "connected" | "disconnected" {
    return this.connectedStateByPeer.get(peerId) ?? "disconnected";
  }

  private setConnectedState(peerId: string, state: "connected" | "disconnected"): void {
    this.connectedStateByPeer.set(peerId, state);
  }

  /**
   * Constructs a CallService instance.
   * @param connectionService Handles network and media stream operations
   * @param userStore Store for user state
   */
  constructor(
    private connectionService: CallConnectionService,
    private userStore: CallUserStore,
    private peerService: CallPeerService,
    private callRepository: CallRepository,
    private callParticipantRepository: CallParticipantRepository,
    private chatService: CallLogChatService,
    private syncService: CallSyncService,
    private messageRepository: MessageRepository,
    private messageStatusRepository: MessageStatusRepository,
    private conversationKeyManager: ConversationKeyManager,
  ) {
    super();
    this.audioService = new CallAudioService();
    this.audioService.on("audio-route-changed", (p) => this.emit("audio-route-changed", p));
    this.audioService.on("audio-routes-updated", (p) => this.emit("audio-routes-updated", p));
    this.callLog = new CallLogService(
      chatService,
      messageRepository,
      messageStatusRepository,
      conversationKeyManager,
      userStore,
      peerService,
    );
    callLog.info("call › service constructed", {
      hasConnectionService: Boolean(connectionService),
      hasUserStore: Boolean(userStore),
    });

    // Register once so remoteStream/switch-cam forwarding never stacks up
    this.connectionService.on("remoteStream", (stream) => {
      callLog.debug("call › remote stream received");
      this.emit("remoteStream", stream);
    });
    this.connectionService.on("switch-cam", (stream) => {
      this.emit("switch-cam", stream);
    });
  }

  async saveCallLogWithReceipts(params: {
    peerId: string;
    content: string;
    status?: MessageStatusType;
    senderId: string;
    messageId?: string;
    conversationId?: string;
  }): Promise<string> {
    return this.callLog.saveCallLogWithReceipts(params);
  }

  /**
   * Starts a call with the given peer. Assumes TCP and WebRTC connections are established.
   * Initializes local media, listens for remote streams, and renegotiates WebRTC.
   * @param peerId The peer id to call
   * @returns Promise<void>
   */
  async startCall(type: "video" | "audio", peerId: string) {
    try {
      const webrtc = this.connectionService.getWebrtcAdapter(peerId);

      webrtc.setIsPolite(this.userStore.user.id < peerId);

      const session = await this.ensureSession(peerId, type, false);

      const isWebrtcConnected =
        this.connectionService.isWebrtcConnected(peerId);
      if (this.getConnectedState(peerId) === "connected" && isWebrtcConnected) {
        callLog.warn("call › already connected", { peerId, type });
        return;
      }
      callLog.info("call › start", { peerId, type });

      if (!isWebrtcConnected) {
        callLog.info("call › connecting to peer", { peerId, type });
        await this.connect(peerId);
      }

      callLog.info("call › connecting to peer");

      // For audio-only calls, default to earpiece
      // For video calls, default to speaker
      InCallManager.start({
        media: type,
        auto: true,
      });
      this.audioService.setupAudioEventListeners();

      // Force initial route based on call type (only once per call)
      if (!this.audioService.hasInitialRouteFor(peerId)) {
        if (type === "audio") {
          this.audioService.setAudioRoute("earpiece");
        } else {
          this.audioService.setAudioRoute("speaker");
        }
        this.audioService.markInitialRouteSet(peerId);
      }

      // Set keep screen on during call
      InCallManager.setKeepScreenOn(true);

      // Initialize local audio and video
      await this.connectionService.initializeStream(type, peerId);

      if (!session.answeredAt) {
        session.answeredAt = new Date();
      }

      // Renegotiate the webrtc to include the audio and video
      await this.connectionService.renegotiate(peerId);

      this.setConnectedState(peerId, "connected");
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › starting call failed", { peerId, ...appErr });
      if (this.getConnectedState(peerId) !== "connected") {
        try {
          await this.terminateCallConnection(peerId, "missed");
        } catch (error) {
          callLog.debug("call › terminateCallConnection cleanup failed after startCall error", { peerId, error });
        }
      }
      captureAppError(appErr);
      throw appErr;
    }
  }

  async answerCall(
    type: "video" | "audio",
    peerId: string,
    conversationId?: string,
    callId?: string
  ) {
    try {
      const webrtc = this.connectionService.getWebrtcAdapter(peerId);
      webrtc.setIsPolite(this.userStore.user.id < peerId);

      const session = await this.ensureSession(
        peerId,
        type,
        true,
        conversationId || undefined,
        callId || undefined
      );
      if (!session.answeredAt) {
        session.answeredAt = new Date();
      }
      this.connectionService.setActiveCall(peerId);

      callLog.info("call › start answer call", { peerId, type });

      // For audio-only calls, default to earpiece
      // For video calls, default to speaker
      InCallManager.start({
        media: type,
        auto: true,
      });
      this.audioService.setupAudioEventListeners();

      // Force initial route based on call type (only once per call)
      if (!this.audioService.hasInitialRouteFor(peerId)) {
        if (type === "audio") {
          this.audioService.setAudioRoute("earpiece");
        } else {
          this.audioService.setAudioRoute("speaker");
        }
        this.audioService.markInitialRouteSet(peerId);
      }

      // Set keep screen on during call
      InCallManager.setKeepScreenOn(true);

      if (!this.connectionService.isWebrtcConnected(peerId)) {
        await this.connectionService.waitForDataChannel(peerId);
      }

      // Initialize local audio and video before announcing readiness
      await this.connectionService.initializeStream(type, peerId);

      this.connectionService.sendCallMessage(peerId, {
        type: "call-ready",
        data: {
          from: this.userStore.user.id,
          to: peerId,
        },
      });

      this.setConnectedState(peerId, "connected");
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › answering call failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async connect(id: string): Promise<void> {
    try {
      callLog.info("call › connect start", { peerId: id });
      try {
        const discoveredPeer = this.peerService.findDiscoveredPeerById(id);

        if (!discoveredPeer) throw new Error("Peer not discovered");
        callLog.info("call › connect with ip and port", { peerId: id });

        await this.connectionService.connectToPeer(
          discoveredPeer.id,
          discoveredPeer.ipAddress,
          discoveredPeer.port,
          discoveredPeer.addresses
        );
      } catch {
        callLog.info("call › connect with no ip and port", { peerId: id });
        await this.connectionService.connectToPeer(id);
      }
      callLog.info("call › connect complete", { peerId: id });
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.warn("call › connect failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  private async handleIncomingBusyReject(
    peerId: string,
    payload: {
      callId: string;
      conversationId: string;
      messageId?: string;
      callType: "audio" | "video";
    }
  ) {
    try {
      const { callId, callType, messageId } = payload;
      callLog.info("call › peer busy received", {
        peerId,
        callId,
        callType,
        conversationId: payload.conversationId,
      });
      if (!callId) {
        callLog.warn("call › peer busy missing callId — skipping log save", {
          peerId,
        });
        return;
      }
      const glareSession = this.callSessions.get(peerId);
      if (glareSession && !glareSession.isIncoming) {
        callLog.info("call › glare detected — skipping busy log", {
          peerId,
          callId,
        });
        return;
      }
      const content =
        callType === "audio" ? "Busy audio call" : "Busy video call";
      const session = this.callSessions.get(peerId);
      const conversationId = session?.conversationId ?? payload.conversationId;
      callLog.debug("call › busy session lookup", {
        peerId,
        sessionFound: Boolean(session),
        conversationId,
      });

      await this.callRepository.updateCallStatus(callId, CallStatus.BUSY);
      callLog.info("call › busy call status updated", { callId, peerId });

      await this.saveCallLogWithReceipts({
        peerId,
        content,
        status: MessageStatusType.DELIVERED,
        senderId: this.userStore.user.id,
        conversationId,
        messageId,
      });
      callLog.info("call › busy call log saved", {
        peerId,
        callId,
        callType,
        conversationId,
      });
    } catch (error) {
      callLog.error("call › busy log save failed", { peerId, error });
    }
  }

  /**
   * Informs a peer of an incoming audio call by sending a signaling message.
   * @param peerId The peer id to inform
   */
  async informPeerForIncomingCall(type: "audio" | "video", peerId: string) {
    if (peerId === this.userStore.user.id) return;

    const session = await this.ensureSession(peerId, type, false);
    this.connectionService.setActiveCall(peerId);

    // Fire TCP/WebRTC attempt in background so sendCallMessage is not blocked.
    // Non-fatal: sendCallMessage has its own WS fallback.
    if (!this.connectionService.isWebrtcConnected(peerId)) {
      this.connect(peerId).catch((connectError) => {
        callLog.warn("call › connect failed, falling back to WS notify", {
          peerId,
          connectError,
        });
      });
    }

    callLog.info("call › initializing media early", { peerId, type });
    try {
      await this.connectionService.initializeStreamEarly(type, peerId);
      this.emit("local-stream-ready", peerId);
    } catch (earlyInitError) {
      callLog.warn("call › early media init failed (non-fatal)", {
        earlyInitError,
      });
    }

    callLog.info("call › incoming notify", {
      peerId,
      type,
      callId: session.callId,
      conversationId: session.conversationId,
    });
    const name = `${this.userStore.user.firstName} ${
      this.userStore.user.lastName ?? ""
    }`.trim();

    // Register busy-reject handler with a stored reference so it can be cleaned up
    if (this.busyRejectHandler) {
      this.connectionService.off("call-busy", this.busyRejectHandler);
    }
    this.busyRejectHandler = (busyPeerId, payload) =>
      this.handleIncomingBusyReject(busyPeerId, payload);
    this.connectionService.on("call-busy", this.busyRejectHandler);

    // Store call-ready handler reference for cleanup on early termination
    if (this.callReadyHandler) {
      this.connectionService.off("call-ready", this.callReadyHandler);
    }
    this.callReadyHandler = async (readyPeerId) => {
      if (readyPeerId !== peerId) return;
      this.callReadyHandler = null;
      await this.handleCallReady(readyPeerId);
    };
    this.connectionService.once("call-ready", this.callReadyHandler);

    try {
      this.connectionService.sendCallMessage(peerId, {
        type: type === "audio" ? "audio-call" : "video-call",
        data: {
          from: this.userStore.user.id,
          to: peerId,
          conversationId: session.conversationId,
          callerName: name,
          callId: session.callId,
        },
      });
    } catch (notifyError) {
      callLog.error("call › notify send failed, sending call-ended", {
        peerId,
        notifyError,
      });
      try {
        await this.terminateCallConnection(peerId, "missed");
      } catch (error) {
        callLog.debug("call › terminateCallConnection cleanup failed after notify error", { peerId, error });
      }
      throw notifyError;
    }
  }

  async rejectIncomingCall(
    type: "audio" | "video",
    peerId: string,
    conversationId?: string
  ) {
    await this.ensureSession(peerId, type, true, conversationId || undefined);
    this.connectionService.sendCallMessage(peerId, {
      type: "call-rejected",
      data: {
        from: this.userStore.user.id,
        to: peerId,
        reason: "declined",
      },
    });
    await this.terminateCallConnection(peerId, "rejected");
  }

  async markMissedIncomingCall(
    type: "audio" | "video",
    peerId: string,
    conversationId?: string
  ) {
    await this.ensureSession(peerId, type, true, conversationId || undefined);
    this.connectionService.sendCallMessage(peerId, {
      type: "call-missed",
      data: {
        from: this.userStore.user.id,
        to: peerId,
        reason: "no-answer",
      },
    });
    await this.terminateCallConnection(peerId, "missed");
  }

  getActiveCallId(peerId: string): string | undefined {
    return this.callSessions.get(peerId)?.callId;
  }

  /**
   * Terminates the call connection with the given peer, renegotiates WebRTC, and notifies the peer.
   * @param peerId The peer id to terminate the call with
   * @returns Promise<void>
   */
  async terminateCallConnection(
    peerId: string,
    reason?: "completed" | "missed" | "rejected"
  ) {
    try {
      callLog.info("call › terminate", { peerId });

      if (this.getConnectedState(peerId) === "connected") {
        this.connectionService.terminateCallConnection(peerId);
        InCallManager.stop();
        InCallManager.setKeepScreenOn(false);
        this.audioService.removeAudioEventListeners();
      }

      const session = this.callSessions.get(peerId);
      const status = this.callLog.resolveFinalStatus(reason, session);
      const endTime = new Date();

      // Determine initiatorId based on isIncoming flag
      const initiatorId = session?.isIncoming ? peerId : this.userStore.user.id;

      const messageId = await this.finalizeSession(
        peerId,
        status,
        endTime,
        initiatorId
      );

      this.connectionService.sendCallMessage(peerId, {
        type: "call-ended",
        data: {
          from: this.userStore.user.id,
          to: peerId,
          callId: session?.callId,
          status:
            status === CallStatus.COMPLETED
              ? "completed"
              : status === CallStatus.REJECTED
              ? "rejected"
              : "missed",
          endedAt: endTime.getTime(),
          durationSeconds: this.callLog.calculateDurationSeconds(session, endTime),
          initiatorId,
          messageId,
          conversationId: session?.conversationId,
          callType: session?.callType === CallType.VIDEO ? "video" : "audio",
        },
      });

      this.setConnectedState(peerId, "disconnected");
      this.connectedStateByPeer.delete(peerId);
      this.audioService.clearInitialRouteFor(peerId);
      this.connectionService.setActiveCall(null);

      if (this.busyRejectHandler) {
        this.connectionService.off("call-busy", this.busyRejectHandler);
        this.busyRejectHandler = null;
      }
      if (this.callReadyHandler) {
        this.connectionService.off("call-ready", this.callReadyHandler);
        this.callReadyHandler = null;
      }
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › terminate failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async handleRemoteCallEnded(peerId: string, payload: RemoteCallEndedPayload) {
    try {
      const session = this.callSessions.get(peerId);
      if (!session || session.finalized) {
        callLog.warn("call › remote ended ignored", {
          peerId,
          hasSession: Boolean(session),
        });

        if (!session) {
          try {
            const initiatorId = payload.initiatorId ?? peerId;
            const callLabel = payload.callType === "video" ? "video" : "audio";

            await this.saveCallLogWithReceipts({
              peerId,
              content: `Missed ${callLabel} call`,
              status: MessageStatusType.DELIVERED,
              senderId: initiatorId,
              messageId: payload.messageId,
              conversationId: payload.conversationId,
            });
            void this.syncService.syncNow();
          } catch (logError) {
            const logAppErr = toAppError(logError, "media");
            callLog.warn("call › retroactive call log failed", {
              peerId,
              ...logAppErr,
            });
          }
        }
        this.chatService.acknowledgeIncomingMessage(peerId, payload.messageId!);
        return;
      }

      if (this.getConnectedState(peerId) === "connected") {
        this.connectionService.terminateCallConnection(peerId);
        InCallManager.stop();
        InCallManager.setKeepScreenOn(false);
        this.audioService.removeAudioEventListeners();
      }

      const status = this.callLog.resolveFinalStatus(payload.status, session);
      const endTime =
        typeof payload.endedAt === "number"
          ? new Date(payload.endedAt)
          : new Date();
      const initiatorId =
        payload.initiatorId ??
        (session.isIncoming ? peerId : this.userStore.user.id);

      await this.finalizeSession(
        peerId,
        status,
        endTime,
        initiatorId,
        payload.durationSeconds,
        payload.messageId
      );
      void this.syncService.syncNow();
      this.chatService.acknowledgeIncomingMessage(peerId, payload.messageId!);
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › remote finalize failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    } finally {
      this.setConnectedState(peerId, "disconnected");
      this.connectedStateByPeer.delete(peerId);
      this.audioService.clearInitialRouteFor(peerId);
      this.connectionService.setActiveCall(null);
    }
  }

  /**
   * Toggles the microphone state for the given peer.
   * @param peerId The peer id
   */
  toggleMic(peerId: string) {
    try {
      this.connectionService.toggleMic(peerId);
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › mic toggle failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Toggles the camera state for the given peer.
   * @param peerId The peer id
   */
  async toggleCamera(peerId: string) {
    try {
      return await this.connectionService.toggleCamera(peerId);
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › camera toggle failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  syncMediaState(peerId: string, micEnabled: boolean, camEnabled: boolean) {
    try {
      this.connectionService.sendCallControlMessage(peerId, "mic_toggle", {
        from: this.userStore.user.id,
        enabled: micEnabled,
      });
      this.connectionService.sendCallControlMessage(peerId, "camera_toggle", {
        from: this.userStore.user.id,
        enabled: camEnabled,
      });
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.warn("call › media state sync failed (non-fatal)", {
        peerId,
        ...appErr,
      });
    }
  }

  toggleSpeaker() {
    this.audioService.toggleSpeaker();
  }

  async switchCamera(peerId: string, isFrontCamera: boolean) {
    await this.connectionService.switchCamera(peerId, isFrontCamera);
  }

  /**
   * Gets the local camera/media stream for the given peer.
   * @param peerId The peer id
   * @returns The local media stream
   */
  getLocalCam(peerId: string) {
    try {
      return this.connectionService.getLocalStream(peerId);
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › get local stream failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  hasActiveSession(peerId: string): boolean {
    const session = this.callSessions.get(peerId);
    return Boolean(session && !session.finalized);
  }

  async handleCallReady(peerId: string): Promise<void> {
    try {
      const session = this.callSessions.get(peerId);
      if (!session || session.finalized) return;

      const peer = await this.peerService.getOrCreatePeerById(
        peerId,
        this.connectionService
      );
      if (!peer) return;

      const call = await this.callRepository.queryCallById(session.callId);
      if (!call) return;

      await this.callParticipantRepository.saveCallParticipant({
        call,
        user: peer as Peer | GuestUser,
        joinedAt: new Date(),
      });

      callLog.info("call › peer participant saved on call-ready", {
        peerId,
        callId: session.callId,
      });
    } catch (error) {
      const appErr = toAppError(error, "media");
      callLog.error("call › peer participant save failed on call-ready", {
        peerId,
        ...appErr,
      });
    }
  }

  private async ensureSession(
    peerId: string,
    type: "video" | "audio",
    isIncoming: boolean,
    conversationId?: string,
    callId?: string
  ): Promise<CallSession> {
    const existingSession = this.callSessions.get(peerId);
    if (existingSession && !existingSession.finalized) {
      return existingSession;
    }

    const peer = await this.peerService.getOrCreatePeerById(
      peerId,
      this.connectionService
    );
    if (!peer) throw new Error("Peer not found");

    const effectiveConversationId = conversationId || undefined;
    const conversation =
      await this.chatService.getOrCreateDirectConversationByPeer(
        peerId,
        effectiveConversationId
      );
    const now = new Date();

    const call = await this.callRepository.saveCall({
      conversation,
      initiator: isIncoming ? peer : (this.userStore.user as Peer | GuestUser),
      callType: type === "video" ? CallType.VIDEO : CallType.AUDIO,
      status: CallStatus.INITIATING,
      startTime: now,
      id: callId,
    });

    await this.callParticipantRepository.saveCallParticipant({
      call,
      user: this.userStore.user as Peer | GuestUser,
      joinedAt: now,
    });

    const session: CallSession = {
      callId: call.id,
      peerId,
      callType: type === "video" ? CallType.VIDEO : CallType.AUDIO,
      startedAt: now,
      peerName: this.callLog.getDisplayName(peer),
      isIncoming,
      finalized: false,
      conversationId: conversation.id,
    };

    this.callSessions.set(peerId, session);
    return session;
  }

  private async finalizeSession(
    peerId: string,
    status: CallStatus,
    endTime: Date,
    initiatorId: string,
    durationSecondsOverride?: number,
    messageId?: string
  ): Promise<string> {
    const session = this.callSessions.get(peerId);
    if (!session || session.finalized) {
      return "";
    }

    await this.callRepository.updateCallStatus(session.callId, status, endTime);
    await this.callParticipantRepository.updateParticipantLeftAtByCallAndUser(
      session.callId,
      this.userStore.user.id,
      endTime
    );

    const callLogMessage = this.callLog.buildCallLogMessage(
      session,
      status,
      endTime,
      durationSecondsOverride
    );

    const messageIdR = await this.saveCallLogWithReceipts({
      peerId,
      messageId,
      content: callLogMessage,
      status: MessageStatusType.SENDING,
      senderId: initiatorId,
      conversationId: session.conversationId,
    });

    session.finalized = true;
    this.callSessions.delete(peerId);
    return messageIdR;
  }

}
