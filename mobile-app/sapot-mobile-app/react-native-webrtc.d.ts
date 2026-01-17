import {
  RTCPeerConnection,
  RTCTrackEvent,
  RTCDataChannelEvent,
} from "react-native-webrtc";


declare module "react-native-webrtc" {
  interface RTCPeerConnection {
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
    ontrack: ((event: RTCTrackEvent) => void) | null;
    onconnectionstatechange: ((event: Event) => void) | null;
    oniceconnectionstatechange: ((event: Event) => void) | null;
    ondatachannel: (event: RTCDataChannelEvent) => void;
  }
}
