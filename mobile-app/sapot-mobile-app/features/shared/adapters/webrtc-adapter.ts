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

interface RTCIceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export class WebrtcAdapter extends EventEmitter {
  private peerConnection: RTCPeerConnection | null;
  private localStream: MediaStream | null;
  // remoteStream and dataChannel have a type of any because there is a conflict on its type
  private remoteStream: any | null;
  private dataChannel: any | null;
  private configuration: RTCConfiguration | undefined;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet: boolean = false;
  readonly peerId: string;
  constructor(peerId: string) {
    super();
    this.peerId = peerId;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.dataChannel = null;
    this.pendingIceCandidates = [];
    this.remoteDescriptionSet = false;
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
      console.error("Error accessing media devices:", error);
      throw error;
    }
  }

  createPeerConnection() {
    console.log("[WebrtcAdapter]: Creating peer connection...");
    this.peerConnection = new RTCPeerConnection(this.configuration);

    // This will receive media such as audio and video of peers
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      console.log("remote audio playing");
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
  }

  setDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    this.setupDataChannel(channel);
  }

  async createOffer() {
    if (!this.peerConnection) {
      console.log(
        "[WebrtcAdapter]: Creating peer connection in create offer method"
      );
      this.createPeerConnection();
    }

    try {
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
    if (!this.peerConnection) {
      console.log(
        "[WebrtcAdapter]: Creating peer connection in handle offer method"
      );
      this.createPeerConnection();
    }

    try {
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
    if (!this.peerConnection) {
      console.log("[WebrtcAdapter]: No peer connection");
      return;
    }

    try {
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
    if (!this.peerConnection) {
      console.log("[WebrtcAdapter]: No peer connection");
      return;
    }

    if (!this.remoteDescriptionSet) {
      // console.log("[WebrtcAdapter]: Queueing ICE candidate");
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      // console.log(`[WebrtcAdapter]: Adding ice candidate`);

      await this.peerConnection!.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("[WebrtcAdapter]: Error adding ice candidate:", error);
    }
  }

  setupDataChannel(channel: RTCDataChannel) {
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
  }

  // TODO: make a type interface for the payload paramater
  sendDataMessage(payload: MessageI<any>) {
    if (
      this.dataChannel &&
      this.dataChannel.readyState === "open" &&
      this.isConnected
    ) {
      // console.log(`[WebrtcAdapter]: Sending payload: ${payload}`);
      this.dataChannel.send(JSON.stringify(payload));
    } else {
      throw new Error("[WebrtcAdapter]: Unable to send payload`");
    }
  }

  terminateCall() {
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
  }

  get isConnected() {
    return (
      this.peerConnection?.connectionState === "connected" &&
      this.dataChannel.readyState === "open"
    );
  }

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // this.remoteStream = null;
    this.dataChannel = null;
    this.pendingIceCandidates = [];
    this.remoteDescriptionSet = false;
    console.log("[WebrtcAdapter]: Cleanup");
  }
}
