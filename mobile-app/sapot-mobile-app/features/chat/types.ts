export interface Peer {
  id: string;
  username: string;
  port: number;
  ipAddress: string;
  serviceName?: string;
  online?: boolean;
}

export interface TcpMessage<T> {
  type: string;
  data: T;
}
