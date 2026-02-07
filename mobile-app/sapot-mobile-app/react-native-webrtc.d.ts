import {
  RTCDataChannelEvent,
  RTCTrackEvent,
} from "react-native-webrtc";

declare module "react-native-webrtc" {
  interface RTCPeerConnection {
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
    ontrack: ((event: RTCTrackEvent) => void) | null;
    onconnectionstatechange: ((event: Event) => void) | null;
    oniceconnectionstatechange: ((event: Event) => void) | null;
    onsignalingstatechange: (event: Event) => void;
    ondatachannel: (event: RTCDataChannelEvent) => void;
  }
}
