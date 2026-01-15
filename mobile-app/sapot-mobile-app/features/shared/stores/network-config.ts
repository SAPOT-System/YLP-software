export class NetworkConfig {
  readonly port: number;

  constructor() {
    this.port = this.generatePort();
  }
  private generatePort(): number {
    return Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
  }
}
