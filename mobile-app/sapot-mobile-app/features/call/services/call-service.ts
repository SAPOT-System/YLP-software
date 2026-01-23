import {
  ConnectionService,
  Peer,
  PeerService,
  UserStore,
} from "@/features/shared";

export class CallService {
  constructor(
    private connectionService: ConnectionService,
    private userStore: UserStore
  ) {}

  // This method will assume that tcp and webrtc connection is good
  async startAudioCall(peerId: string) {
    try {
      // Initialize local audio
      await this.connectionService.initializeAudio(peerId);

      // Renegotiate the webrtc to include the audio
      await this.connectionService.renegotiate(peerId);
    } catch (error) {
      console.warn("[CallService]: Error starting audio call:", error);
      throw error;
    }
  }

  // Inform peer for incoming call
  informPeerForIncomingAudioCall(peerId: string) {
    this.connectionService.sendMessage(peerId, {
      type: "audio-call",
      data: { senderId: this.userStore.user.id },
    });
  }

  async terminateCallConnection(peerId: string) {
    this.connectionService.terminateCallConnection(peerId);
    await this.connectionService.renegotiate(peerId);
    this.connectionService.sendMessage(peerId, {
      type: "call-ended",
      data: { senderId: this.userStore.user.id },
    });
  }
}
