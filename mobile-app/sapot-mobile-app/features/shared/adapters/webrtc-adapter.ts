import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from "react-native-webrtc";
import { EventEmitter } from "events";
import { RTCSessionDescriptionInit } from "react-native-webrtc/lib/typescript/RTCSessionDescription";
import { MessageI } from "../types";
import { MediaStreamTrack } from "react-native-webrtc";

interface RTCIceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export class WebrtcAdapter extends EventEmitter {
  /**
   * This property holds the connection of webrtc
   */
  private peerConnection?: RTCPeerConnection;

  /**
   * This property stores the audio and video of the current user of the app
   */
  private localStream?: MediaStream;

  // Note: remoteStream and dataChannel have a type of any because there is a conflict on its type

  /**
   * This property stores the audio and video of the peer that is currently interacting by the user
   */
  private remoteStream?: any;

  /**
   * This property manages the chat connection
   */
  private dataChannel?: any;

  /**
   * This property holds the information whether the app will use servers or not
   */
  private configuration: RTCConfiguration;

  /**
   * This property holds the array of data that is essential to the connection
   */
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  /**
   * This flag will be used to by the app to know if remote description is set which is useful on forming connection
   */
  private remoteDescriptionSet: boolean = false;

  /**
   * This property is capable of controlling microphone
   */
  private audioTrack?: MediaStreamTrack;

  /**
   * This property is capable of controlling camera visibility
   */
  private videoTrack?: MediaStreamTrack;

  /**
   * This property holds the id of peer that holds this class state
   */
  readonly peerId: string;

  constructor(peerId: string) {
    super();
    this.peerId = peerId;
    this.configuration = {
      iceServers: [
        // No turn server for physical devices
        // Just for development for android emulators. Note that the host computer needs to run turn server to make this work.
        // {
        //   urls: [
        //     "turn:10.0.2.2:5349?transport=udp",
        //     "turn:10.0.2.2:5349?transport=tcp",
        //   ],
        //   username: "test",
        //   credential: "test",
        // },
      ],
      iceTransportPolicy: "all",
    };
  }

  async initializeLocalStream(audio = false, video = false) {
    try {
      const constraints = {
        audio,
        video: video
          ? {
              width: { min: 640, ideal: 1280 },
              height: { min: 480, ideal: 720 },
              frameRate: { min: 30, ideal: 60 },
            }
          : false,
      };

      this.localStream = await mediaDevices.getUserMedia(constraints);

      this.audioTrack = this.localStream.getAudioTracks()[0];
      this.videoTrack = this.localStream.getVideoTracks()[0];

      // Add local stream to connection for audio calls and video calls
      if (this.localStream) {
        console.log("[WebrtcAdapter]: Adding local stream to connection");
        this.localStream.getTracks().forEach((track) => {
          console.log("[WebrtcAdapter]: Adding track: ", track.kind);
          if (!this.peerConnection)
            throw new Error("Peer connection not initialized");
          this.peerConnection.addTrack(track, this.localStream!);
        });
      } else {
        console.log("[WebrtcAdapter]: No local stream to connection");
      }
    } catch (error) {
      console.error(
        `[WebrtcAdapter]: Error initializing local stream\n${JSON.stringify(
          { audio, video },
          null,
          2
        )}`
      );
      throw error;
    }
  }

  createPeerConnection() {
    try {
      console.log("[WebrtcAdapter]: Creating peer connection...");
      this.peerConnection = new RTCPeerConnection(this.configuration);

      // This will receive media such as audio and video of peers
      this.peerConnection.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        this.emit("remoteStream", event.streams[0]);
      };

      this.peerConnection.onconnectionstatechange = (event) => {
        // console.log(this.peerConnection?.connectionState);
        switch (this.peerConnection?.connectionState) {
          case "closed":
            console.log("[WebrtcAdapter]: Call being disconnected");
            this.emit("connection-closed");
            break;
          case "connected":
            if (this.dataChannel.readyState == "open") {
              this.emit("connection-established");
            }
            break;
        }
      };

      this.peerConnection.ondatachannel = (event) => {
        // console.log(`Data channel received: ${event.channel}`);
        this.setDataChannel(event.channel);
      };

      this.peerConnection.oniceconnectionstatechange = (event) => {
        // console.log(
        //   "[WebrtcAdapter]: ICE Connection state:",
        //   this.peerConnection?.iceConnectionState
        // );
        switch (this.peerConnection?.iceConnectionState) {
          case "connected":
            console.log("[WebrtcAdapter]: ICE connection connected");
            break;
          case "completed":
            console.log("[WebrtcAdapter]: ICE connection completed");
            break;
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          // console.log(`[WebrtcAdapter]: Sending ice cnadidate`);
          this.emit("onicecandidate", event.candidate);
        }
      };

      // Create data channel for text chat
      this.dataChannel = this.peerConnection.createDataChannel("chat");
      // console.log(this.dataChannel ? "Data channel on" : "Data channel off");
      this.setupDataChannel(this.dataChannel);

      // console.log("Peer connection created:", this.peerConnection ? true : false);
    } catch (error) {
      console.error("[WebrtcAdapter]: Error creating peer connection:", error);
      throw error;
    }
  }

  setDataChannel(channel: RTCDataChannel) {
    try {
      this.dataChannel = channel;
      this.setupDataChannel(channel);
    } catch (error) {
      console.error("[WebrtcAdapter]: Error to set data channel:", error);
      throw error;
    }
  }

  async createOffer() {
    try {
      if (!this.peerConnection) {
        console.log(
          "[WebrtcAdapter]: Creating peer connection in create offer method"
        );
        this.createPeerConnection();
      }

      // console.log(`[WebrtcAdapter]: Creating offer...`);
      const offer = await this.peerConnection!.createOffer();
      // console.log(`[WebrtcAdapter]: Setting local description...`);
      await this.peerConnection!.setLocalDescription(offer);

      return {
        type: "offer",
        sdp: offer.sdp,
      };
    } catch (error) {
      console.error("[WebrtcAdapter]: Error creating offer:", error);
      throw error;
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit | undefined) {
    try {
      if (!this.peerConnection) {
        console.log(
          "[WebrtcAdapter]: Creating peer connection in handle offer method"
        );
        this.createPeerConnection();
      }

      // console.log(`[WebrtcAdapter]: Setting remote description`);

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await this.peerConnection!.createAnswer();
      // console.log(`[WebrtcAdapter]: Setting local description`);
      await this.peerConnection!.setLocalDescription(answer);

      this.remoteDescriptionSet = true;

      for (const candidate of this.pendingIceCandidates) {
        await this.addIceCandidate(candidate);
      }

      this.pendingIceCandidates = [];

      return {
        type: "answer",
        sdp: answer.sdp,
      };
    } catch (error) {
      console.error("[WebrtcAdapter]: Error handling offer:", error);
      throw error;
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit | undefined) {
    try {
      if (!this.peerConnection) {
        console.log("[WebrtcAdapter]: No peer connection");
        return;
      }

      // console.log(`[WebrtcAdapter]: Setting remote description`);

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription(answer)
      );

      this.remoteDescriptionSet = true;

      for (const candidate of this.pendingIceCandidates) {
        await this.addIceCandidate(candidate);
      }
      this.pendingIceCandidates = [];
    } catch (error) {
      console.error("[WebrtcAdapter]: Error handling answer:", error);
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (!this.peerConnection) {
        console.log("[WebrtcAdapter]: No peer connection");
        return;
      }

      if (!this.remoteDescriptionSet) {
        // console.log("[WebrtcAdapter]: Queueing ICE candidate");
        this.pendingIceCandidates.push(candidate);
        return;
      }

      // console.log(`[WebrtcAdapter]: Adding ice candidate`);

      await this.peerConnection!.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("[WebrtcAdapter]: Error adding ice candidate:", error);
      throw error;
    }
  }

  setupDataChannel(channel: RTCDataChannel) {
    try {
      // console.log(`[WebrtcAdapter]: Setup data channel`);
      channel.onopen = () => {
        console.log("[WebrtcAdapter]: Data channel opened");
        this.emit("datachannel-open");

        if (this.peerConnection?.connectionState === "connected")
          this.emit("connection-established");
      };

      // This will recieve message from peers webrtc's datachannel
      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // console.log(`[WebrtcAdapter]: Data channel received: ${message}`);
          this.emit("receivedMessage", message);
        } catch (error) {
          console.error("Error parsing receive message:", error);
        }
      };

      channel.onerror = (error) => {
        this.emit("connection-failed", error);
      };

      channel.onclose = () => {
        console.log("[WebrtcAdapter]: Data channel closed");
      };
    } catch (error) {
      console.error("[WebrtcAdapter]: Error to setup data channel:", error);
      throw error;
    }
  }

  // TODO: make a type interface for the payload paramater
  sendDataMessage(payload: MessageI<any>) {
    try {
      if (
        this.dataChannel &&
        this.dataChannel.readyState === "open" &&
        this.isConnected
      ) {
        // console.log(`[WebrtcAdapter]: Sending payload: ${payload}`);
        this.dataChannel.send(JSON.stringify(payload));
      } else {
        throw new Error("Unable to send payload`");
      }
    } catch (error) {
      console.error(
        `[WebrtcAdapter]: Error sending data message\n${JSON.stringify(
          payload,
          null,
          2
        )}`
      );
      throw error;
    }
  }

  terminateCall() {
    try {
      if (!this.localStream) {
        console.log("local stream null");
        return;
      }
      if (!this.peerConnection) {
        console.log("peer connection null");
        return;
      }
      // stop local media tracks
      this.localStream.getTracks().forEach((track) => track.stop());

      // remove tracks from connection
      this.peerConnection.getSenders().forEach((sender) => {
        if (
          sender.track &&
          (sender.track.kind === "audio" || sender.track.kind === "video")
        ) {
          this.peerConnection!.removeTrack(sender);
        }
      });
    } catch (error) {
      console.error("[WebrtcAdapter]: Error terminating the call:", error);
      throw error;
    }
  }

  toggleMic() {
    try {
      if (!this.audioTrack) throw Error("Audio track not initialized");
      this.audioTrack.enabled = this.audioTrack.enabled ? false : true;
      console.log("toggling mic to", this.audioTrack.enabled);
    } catch (error) {
      console.error("[WebrtcAdapter]: Error toggling the microphone:", error);
      throw error;
    }
  }

  toggleCamera() {
    try {
      if (!this.videoTrack) throw Error("Video track not initialized");
      this.videoTrack.enabled = this.videoTrack.enabled ? false : true;
      console.log("toggling camera to", this.videoTrack.enabled);
    } catch (error) {
      console.error("[WebrtcAdapter]: Error toggling the camera:", error);
      throw error;
    }
  }

  get isConnected() {
    try {
      return (
        this.peerConnection?.connectionState === "connected" &&
        this.dataChannel.readyState === "open"
      );
    } catch (error) {
      console.error(
        "[WebrtcAdapter]: Error getting if webrtc is connected:",
        error
      );
      throw error;
    }
  }

  getLocalStream() {
    try {
      if (!this.localStream) throw new Error("Local stream is undefined");
      return this.localStream;
    } catch (error) {
      console.error("[WebrtcAdapter]: Error getting local stream:", error);
      throw error;
    }
  }

  cleanup() {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = undefined;
      }

      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = undefined;
      }

      this.remoteStream = undefined;
      this.dataChannel = undefined;
      this.pendingIceCandidates = [];
      this.remoteDescriptionSet = false;
      console.log("[WebrtcAdapter]: Cleanup");
    } catch (error) {
      console.error("[WebrtcAdapter]: Error getting local stream:", error);
      throw error;
    }
  }
}
