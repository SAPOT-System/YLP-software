export interface Peer {
  id: string;
  username: string;
  port: number;
  ipAddress: string;
  serviceName?: string;
  online?: boolean;
}

export interface MessageI<T> {
  type: string; // TODO: implement enum
  data: T;
}

