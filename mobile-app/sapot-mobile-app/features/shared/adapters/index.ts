import baseLogger from "@/features/shared/utils/logger";

const adapterLog = baseLogger.extend("adapter");
adapterLog.debug("[shared/adapters] module loaded");

export { TcpClientAdapter } from "./tcp-client-adapter";
export { TcpServerAdapter } from "./tcp-server-adapter";
export { WebrtcAdapter } from "./webrtc-adapter";
export { WsSignalingAdapter } from "./ws-signaling-adapter";
export { ZeroconfAdapter } from "./zeroconf-adapter";

