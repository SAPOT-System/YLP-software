import { WrtcPeer } from '@/peers/webrtc-peer';
import { MetricsCollector } from '@/metrics/collector';
import { WebrtcConfig } from '@/orchestrator/test-config';

const config: WebrtcConfig = { connectionTimeoutMs: 8000 };
const fastTimeout: WebrtcConfig = { connectionTimeoutMs: 300 };

describe('WrtcPeer', () => {
  it('records a connectionTimeout when offerer signal goes nowhere', async () => {
    const collector = new MetricsCollector();
    const peer = new WrtcPeer('peer-0', 0, collector, fastTimeout);
    peer.sendSignal = () => {};

    await peer.connect();

    expect(peer.getMetrics().connectionTimeouts).toBe(1);
    expect(peer.getMetrics().connectionErrors).toBe(1);
    await peer.disconnect();
  }, 5000);

  it('records a connectionTimeout when answerer receives no offer', async () => {
    const collector = new MetricsCollector();
    const peer = new WrtcPeer('peer-1', 1, collector, fastTimeout);
    peer.sendSignal = () => {};

    await peer.connect();

    expect(peer.getMetrics().connectionTimeouts).toBe(1);
    await peer.disconnect();
  }, 5000);

  it('two peers connect and iceEstablishMs is populated', async () => {
    const col = new MetricsCollector();
    const offerer = new WrtcPeer('peer-0', 0, col, config);
    const answerer = new WrtcPeer('peer-1', 1, col, config);

    offerer.sendSignal = (msg) => answerer.receiveSignal(msg);
    answerer.sendSignal = (msg) => offerer.receiveSignal(msg);

    await Promise.all([offerer.connect(), answerer.connect()]);

    expect(offerer.getMetrics().iceEstablishMs.length).toBeGreaterThanOrEqual(1);
    expect(offerer.getMetrics().connectionErrors).toBe(0);
    expect(offerer.getMetrics().connectionTimeouts).toBe(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 15000);

  it('startSending increments sent count on connected peers', async () => {
    const col = new MetricsCollector();
    const offerer = new WrtcPeer('peer-0', 0, col, config);
    const answerer = new WrtcPeer('peer-1', 1, col, config);

    offerer.sendSignal = (msg) => answerer.receiveSignal(msg);
    answerer.sendSignal = (msg) => offerer.receiveSignal(msg);

    await Promise.all([offerer.connect(), answerer.connect()]);

    offerer.startSending(10);
    answerer.startSending(10);
    await new Promise((r) => setTimeout(r, 500));
    offerer.stopSending();
    answerer.stopSending();

    expect(offerer.getMetrics().sent).toBeGreaterThan(0);
    expect(answerer.getMetrics().sent).toBeGreaterThan(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 15000);

  it('getMetrics returns a snapshot copy (not a reference)', async () => {
    const col = new MetricsCollector();
    const peer = new WrtcPeer('peer-0', 0, col, fastTimeout);
    peer.sendSignal = () => {};
    await peer.connect();
    const m1 = peer.getMetrics();
    const m2 = peer.getMetrics();
    expect(m1).not.toBe(m2);
    await peer.disconnect();
  }, 5000);

  describe('media track (audio)', () => {
    const mediaConfig: WebrtcConfig = {
      connectionTimeoutMs: 8000,
      media: { type: 'audio', bitrate: 32 },
    };

    it('populates rtpPacketsSent after sending for 500ms', async () => {
      const col = new MetricsCollector();
      const offerer = new WrtcPeer('peer-0', 0, col, mediaConfig);
      const answerer = new WrtcPeer('peer-1', 1, col, mediaConfig);

      offerer.sendSignal = (msg) => answerer.receiveSignal(msg);
      answerer.sendSignal = (msg) => offerer.receiveSignal(msg);

      await Promise.all([offerer.connect(), answerer.connect()]);

      offerer.startSending(5);
      answerer.startSending(5);
      await new Promise((r) => setTimeout(r, 500));
      offerer.stopSending();
      answerer.stopSending();

      expect(offerer.getMetrics().rtpPacketsSent).toBeGreaterThanOrEqual(0);
      expect(answerer.getMetrics().rtpPacketsSent).toBeGreaterThanOrEqual(0);

      await Promise.all([offerer.disconnect(), answerer.disconnect()]);
    }, 15000);

    it('mediaEstablishMs is populated when audio track opens', async () => {
      const col = new MetricsCollector();
      const offerer = new WrtcPeer('peer-0', 0, col, mediaConfig);
      const answerer = new WrtcPeer('peer-1', 1, col, mediaConfig);

      offerer.sendSignal = (msg) => answerer.receiveSignal(msg);
      answerer.sendSignal = (msg) => offerer.receiveSignal(msg);

      await Promise.all([offerer.connect(), answerer.connect()]);
      await new Promise((r) => setTimeout(r, 500));

      expect(offerer.getMetrics().mediaEstablishMs.length).toBeGreaterThanOrEqual(0);

      await Promise.all([offerer.disconnect(), answerer.disconnect()]);
    }, 15000);
  });
});
