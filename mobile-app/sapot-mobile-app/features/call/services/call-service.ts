import { ChatService } from "@/features/chat";
import { CallStatus, CallType } from "@/features/shared/database/model/Call";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { GuestUser } from "@/features/shared/database/model/guest-user";
import { Peer } from "@/features/shared/database/model/Peer";
import { ConnectionService } from "@/features/shared/services/connection-service";
import { PeerService } from "@/features/shared/services/peer-service";
import { UserStore } from "@/features/shared/stores/user-store";
import { callLog } from "@/features/shared/utils/logger";
import { TypedEventEmitter } from "@/features/shared/utils/typed-event-emitter";
import { DeviceEventEmitter } from "react-native";
import InCallManager from "react-native-incall-manager";
import { MediaStream } from "react-native-webrtc";
import { CallParticipantRepository, CallRepository } from "../repositories";
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
};

type CallConnectionService = Pick<
  ConnectionService,
  | "isWebrtcConnected"
  | "initializeStream"
  | "renegotiate"
  | "sendCallMessage"
  | "connectToPeer"
  | "on"
  | "terminateCallConnection"
  | "getWebrtcAdapter"
  | "toggleMic"
  | "toggleCamera"
  | "switchCamera"
  | "getLocalStream"
  | "isWebSocketAllowed"
  | "setActiveCall"
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
  "findDiscoveredPeerById" | "getOrCreatePeerById"
>;

type CallSyncService = {
  syncNow(): Promise<void>;
};

type CallLogChatService = Pick<
  ChatService,
  | "saveCallLogWithReceipts"
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

type CallSession = {
  callId: string;
  peerId: string;
  callType: CallType;
  startedAt: Date;
  answeredAt?: Date;
  peerName: string;
  isIncoming: boolean;
  finalized: boolean;
  conversationId: string;
};

// TODO: probably store the peerId state
/**
 * CallService manages call connections, including starting/terminating calls, handling streams,
 * and toggling audio/video for peer-to-peer calls. It extends EventEmitter to emit call-related events.
 */
export class CallService extends TypedEventEmitter<CallServiceEvents> {
  private connectedState: "connected" | "disconnected" = "disconnected";
  private currentAudioRoute: AudioRouteTypes = "speaker";
  private availableRoutes: { type: AudioRouteTypes; label: string }[] = [];
  private isBluetoothConnected = false;
  private isHeadsetConnected = false;
  private initialRouteSetFor: Set<string> = new Set();
  private callSessions: Map<string, CallSession> = new Map();

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
    private syncService: CallSyncService
  ) {
    super();
    callLog.info("call › service constructed", {
      hasConnectionService: Boolean(connectionService),
      hasUserStore: Boolean(userStore),
    });
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

      webrtc.setIsPolite(false);

      const session = await this.ensureSession(peerId, type, false);

      const isWebrtcConnected =
        this.connectionService.isWebrtcConnected(peerId);
      if (this.connectedState === "connected" && isWebrtcConnected) {
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

      // Force initial route based on call type (only once per call)
      if (!this.initialRouteSetFor.has(peerId)) {
        if (type === "audio") {
          this.setAudioRoute("earpiece");
        } else {
          this.setAudioRoute("speaker");
        }
        this.initialRouteSetFor.add(peerId);
      }

      // Set keep screen on during call
      InCallManager.setKeepScreenOn(true);

      this.listenToRemoteStream();

      // Initialize local audio and video
      await this.connectionService.initializeStream(type, peerId);

      if (!session.answeredAt) {
        session.answeredAt = new Date();
      }

      // Renegotiate the webrtc to include the audio and video
      await this.connectionService.renegotiate(peerId);

      this.connectedState = "connected";
    } catch (error) {
      callLog.error("call › starting call failed", { peerId, error });
      if (this.connectedState !== "connected") {
        try {
          await this.terminateCallConnection(peerId, "missed");
        } catch {
          // best-effort cleanup
        }
      }
      throw error;
    }
  }

  async answerCall(
    type: "video" | "audio",
    peerId: string,
    conversationId?: string
  ) {
    try {
      const webrtc = this.connectionService.getWebrtcAdapter(peerId);
      webrtc.setIsPolite(true);

      const session = await this.ensureSession(
        peerId,
        type,
        true,
        conversationId || undefined
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

      // Force initial route based on call type (only once per call)
      if (!this.initialRouteSetFor.has(peerId)) {
        if (type === "audio") {
          this.setAudioRoute("earpiece");
        } else {
          this.setAudioRoute("speaker");
        }
        this.initialRouteSetFor.add(peerId);
      }

      // Set keep screen on during call
      InCallManager.setKeepScreenOn(true);

      this.connectionService.sendCallMessage(peerId, {
        type: "call-ready",
        data: {
          from: this.userStore.user.id,
          to: peerId,
        },
      });

      // Initialize local audio and video
      await this.connectionService.initializeStream(type, peerId);
      this.listenToRemoteStream();

      this.connectedState = "connected";
    } catch (error) {
      callLog.error("call › answering call failed", { peerId, error });
      throw error;
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
          discoveredPeer.port
        );
      } catch {
        callLog.info("call › connect with no ip and port", { peerId: id });
        await this.connectionService.connectToPeer(id);
      }
      callLog.info("call › connect complete", { peerId: id });
    } catch (error) {
      callLog.warn("call › connect failed", { peerId: id, error });
      throw error;
    }
  }

  setupAudioEventListeners() {
    // Listen for wired headset plug/unplug events
    DeviceEventEmitter.addListener("WiredHeadset", (data) => {
      callLog.info("call › wired headset event:", data);
      this.isHeadsetConnected = data.device === "WiredHeadset";
      this.updateAvailableRoutes();

      // Auto-route to headset if just plugged in
      if (this.isHeadsetConnected) {
        this.setAudioRoute("headset");
      }
    });

    // Listen for Bluetooth headset connection events
    DeviceEventEmitter.addListener("BluetoothHeadset", (data) => {
      callLog.info("call › bluetooth headset event:", data);
      this.isBluetoothConnected = data.device === "BluetoothHeadset";
      this.updateAvailableRoutes();

      // Auto-route to Bluetooth if just connected
      if (this.isBluetoothConnected) {
        this.setAudioRoute("bluetooth");
      }
    });

    // Proximity sensor - auto-switch to earpiece when phone near ear
    DeviceEventEmitter.addListener("Proximity", (data) => {
      if (data.isNear) {
        // Phone near ear - switch to earpiece
        if (
          this.currentAudioRoute !== "earpiece" &&
          this.currentAudioRoute !== "headset" &&
          this.currentAudioRoute !== "bluetooth"
        ) {
          this.setAudioRoute("earpiece");
        }
      } else if (this.currentAudioRoute === "earpiece") {
        // Phone away from ear - restore previous route (speaker if video call)
        // This requires tracking previous route separately
      }
    });
  }

  updateAvailableRoutes() {
    const routes: { type: AudioRouteTypes; label: string }[] = [];

    // Always available
    routes.push({ type: "earpiece", label: "Earpiece" });
    routes.push({ type: "speaker", label: "Speaker" });

    // Check for headset (platform-specific)
    if (this.isHeadsetConnected) {
      routes.push({ type: "headset", label: "Wired Headset" });
    }

    // Check for Bluetooth
    if (this.isBluetoothConnected) {
      routes.push({ type: "bluetooth", label: "Bluetooth" });
    }

    this.availableRoutes = routes;
    this.emit("audio-routes-updated", {
      routes: this.availableRoutes,
    });
  }

  async setAudioRoute(route: AudioRouteTypes) {
    callLog.debug("call › setting audio route to:", route);

    switch (route) {
      case "speaker":
        InCallManager.setForceSpeakerphoneOn(true);
        this.currentAudioRoute = "speaker";
        break;

      case "earpiece":
        InCallManager.setForceSpeakerphoneOn(false);
        this.currentAudioRoute = "earpiece";
        break;

      case "headset":
        // For wired headsets, just turn off speaker - system auto-routes
        InCallManager.setForceSpeakerphoneOn(false);
        this.currentAudioRoute = "headset";
        break;

      case "bluetooth":
        // For Bluetooth, ensure SCO is enabled for call audio
        InCallManager.setForceSpeakerphoneOn(false);
        // Note: On some Android versions, additional native code may be needed
        this.currentAudioRoute = "bluetooth";
        break;

      default:
        callLog.warn("call › unknown audio route:", route);
    }

    this.emit("audio-route-changed", {
      route: this.currentAudioRoute,
      available: this.availableRoutes,
    });
  }

  /**
   * Listens for remote media streams from the connection service and emits them to listeners.
   */
  listenToRemoteStream() {
    this.connectionService.on("remoteStream", (stream) => {
      callLog.debug("call › remote stream received");
      this.emit("remoteStream", stream);
    });
    this.connectionService.on("switch-cam", (stream) => {
      this.emit("switch-cam", stream);
    });
  }

  async listenToHandleIncomingBusyReject() {
    this.connectionService.on("call-busy", (peerId, payload) =>
      this.handleIncomingBusyReject(peerId, payload)
    );
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

      await this.chatService.saveCallLogWithReceipts({
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

    callLog.info("call › incoming notify", {
      peerId,
      type,
      callId: session.callId,
      conversationId: session.conversationId,
    });
    const name = `${this.userStore.user.firstName} ${
      this.userStore.user.lastName ?? ""
    }`.trim();

    this.listenToHandleIncomingBusyReject();

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
      } catch {
        // best-effort cleanup
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

      if (this.connectedState === "connected") {
        this.connectionService.terminateCallConnection(peerId);
        InCallManager.stop();
        InCallManager.setKeepScreenOn(false);
      }

      const session = this.callSessions.get(peerId);
      const status = this.resolveFinalStatus(reason, session);
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
          status:
            status === CallStatus.COMPLETED
              ? "completed"
              : status === CallStatus.REJECTED
              ? "rejected"
              : "missed",
          endedAt: endTime.getTime(),
          durationSeconds: this.calculateDurationSeconds(session, endTime),
          initiatorId,
          messageId,
          conversationId: session?.conversationId,
          callType: session?.callType === CallType.VIDEO ? "video" : "audio",
        },
      });

      this.connectedState = "disconnected";
      this.initialRouteSetFor.delete(peerId);
      this.connectionService.setActiveCall(null);
    } catch (error) {
      callLog.error("call › terminate failed", { peerId, error });
      throw error;
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

            await this.chatService.saveCallLogWithReceipts({
              peerId,
              content: `Missed ${callLabel} call`,
              status: MessageStatusType.DELIVERED,
              senderId: initiatorId,
              messageId: payload.messageId,
              conversationId: payload.conversationId,
            });
            void this.syncService.syncNow();
          } catch (logError) {
            callLog.warn("call › retroactive call log failed", {
              peerId,
              logError,
            });
          }
        }
        this.chatService.acknowledgeIncomingMessage(peerId, payload.messageId!);
        return;
      }

      if (this.connectedState === "connected") {
        this.connectionService.terminateCallConnection(peerId);
        InCallManager.stop();
        InCallManager.setKeepScreenOn(false);
      }

      const status = this.resolveFinalStatus(payload.status, session);
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

      this.connectedState = "disconnected";
      this.initialRouteSetFor.delete(peerId);
    } catch (error) {
      callLog.error("call › remote finalize failed", { peerId, error });
      throw error;
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
      callLog.error("call › mic toggle failed", { peerId, error });
      throw error;
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
      callLog.error("call › camera toggle failed", { peerId, error });
      throw error;
    }
  }

  toggleSpeaker() {
    const newRoute =
      this.currentAudioRoute === "speaker" ? "earpiece" : "speaker";
    this.setAudioRoute(newRoute);
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
      callLog.error("call › get local stream failed", { peerId, error });
      throw error;
    }
  }

  hasActiveSession(peerId: string): boolean {
    const session = this.callSessions.get(peerId);
    return Boolean(session && !session.finalized);
  }

  private async ensureSession(
    peerId: string,
    type: "video" | "audio",
    isIncoming: boolean,
    conversationId?: string
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
      peerName: this.getDisplayName(peer),
      isIncoming,
      finalized: false,
      conversationId: conversation.id,
    };

    this.callSessions.set(peerId, session);
    return session;
  }

  private resolveFinalStatus(
    reason: "completed" | "missed" | "rejected" | undefined,
    session?: CallSession
  ): CallStatus {
    if (reason === "rejected") return CallStatus.REJECTED;
    if (reason === "missed") return CallStatus.MISSED;
    if (reason === "completed") return CallStatus.COMPLETED;
    return session?.answeredAt ? CallStatus.COMPLETED : CallStatus.MISSED;
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

    const callLogMessage = this.buildCallLogMessage(
      session,
      status,
      endTime,
      durationSecondsOverride
    );

    const messageIdR = await this.chatService.saveCallLogWithReceipts({
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

  private buildCallLogMessage(
    session: CallSession,
    status: CallStatus,
    endTime: Date,
    durationSecondsOverride?: number
  ): string {
    if (status === CallStatus.REJECTED) {
      return "Call declined";
    }

    if (status === CallStatus.MISSED) {
      const callLabel = session.callType === CallType.VIDEO ? "video" : "audio";
      return `Missed ${callLabel} call`;
    }

    const durationFrom = session.answeredAt ?? session.startedAt;
    const durationInSeconds =
      typeof durationSecondsOverride === "number"
        ? Math.max(0, Math.floor(durationSecondsOverride))
        : Math.max(
            0,
            Math.floor((endTime.getTime() - durationFrom.getTime()) / 1000)
          );

    const callLabel = session.callType === CallType.VIDEO ? "Video" : "Audio";
    return `${callLabel} call \u2022 ${this.formatDuration(durationInSeconds)}`;
  }

  private calculateDurationSeconds(
    session: CallSession | undefined,
    endTime: Date
  ): number {
    if (!session) {
      return 0;
    }

    const durationFrom = session.answeredAt ?? session.startedAt;
    return Math.max(
      0,
      Math.floor((endTime.getTime() - durationFrom.getTime()) / 1000)
    );
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds
      ).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  private getDisplayName(peer: Peer | GuestUser): string {
    const fullName = [peer.firstName, peer.lastName].filter(Boolean).join(" ");
    return fullName || peer.username || "Unknown";
  }
}
