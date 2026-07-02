import { IceRestartController, IceRestartControllerOptions } from "../ice-restart-controller";

describe("IceRestartController", () => {
  let createRestartOffer: jest.Mock;
  let emitSignalOffer: jest.Mock;
  let emitIceRestarting: jest.Mock;
  let emitConnectionFailed: jest.Mock;
  let log: jest.Mock;
  let controller: IceRestartController;

  function makeController(overrides: Partial<IceRestartControllerOptions> = {}): IceRestartController {
    return new IceRestartController({
      createRestartOffer,
      emitSignalOffer,
      emitIceRestarting,
      emitConnectionFailed,
      log,
      ...overrides,
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    createRestartOffer = jest.fn().mockResolvedValue({ type: "offer", sdp: "v=0\r\n" });
    emitSignalOffer = jest.fn();
    emitIceRestarting = jest.fn();
    emitConnectionFailed = jest.fn();
    log = jest.fn();
    controller = makeController();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("scheduleIceRestart", () => {
    it("emits ice-restarting immediately on scheduleIceRestart", () => {
      controller.scheduleIceRestart("disconnected");
      expect(emitIceRestarting).toHaveBeenCalled();
    });

    it("calls createRestartOffer after the delay (non-immediate)", async () => {
      controller.scheduleIceRestart("disconnected", false);
      expect(createRestartOffer).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1500);
      await Promise.resolve(); // flush promise queue
      expect(createRestartOffer).toHaveBeenCalled();
    });

    it("calls createRestartOffer immediately when immediate=true", async () => {
      controller.scheduleIceRestart("failed", true);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      expect(createRestartOffer).toHaveBeenCalled();
    });

    it("calls emitSignalOffer with the offer after createRestartOffer resolves", async () => {
      controller.scheduleIceRestart("failed", true);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(emitSignalOffer).toHaveBeenCalledWith(
        expect.objectContaining({ type: "offer", sdp: "v=0\r\n", iceRestart: true })
      );
    });

    it("calls emitConnectionFailed when maxIceRestartAttempts is exceeded", () => {
      // Drive iceRestartAttempts to max by patching the private field, then
      // verify that the next schedule emits connection-failed instead of restarting.
      (controller as unknown as { iceRestartAttempts: number }).iceRestartAttempts = 3;
      controller.scheduleIceRestart("failed");
      expect(emitConnectionFailed).toHaveBeenCalled();
      expect(emitIceRestarting).not.toHaveBeenCalled();
    });

    it("does not call emitConnectionFailed before max attempts are reached", () => {
      controller.scheduleIceRestart("disconnected");
      expect(emitConnectionFailed).not.toHaveBeenCalled();
    });
  });

  describe("resetIceRestartState", () => {
    it("clears attempt count so subsequent schedules work again", () => {
      // Set attempts to max, then reset and verify schedule works again
      (controller as unknown as { iceRestartAttempts: number }).iceRestartAttempts = 3;
      controller.resetIceRestartState();
      emitConnectionFailed.mockClear();
      emitIceRestarting.mockClear();

      controller.scheduleIceRestart("disconnected");
      expect(emitIceRestarting).toHaveBeenCalled();
      expect(emitConnectionFailed).not.toHaveBeenCalled();
    });

    it("cancels the pending restart timer", () => {
      controller.scheduleIceRestart("disconnected", false);
      controller.resetIceRestartState();
      createRestartOffer.mockClear();
      jest.advanceTimersByTime(2000);
      expect(createRestartOffer).not.toHaveBeenCalled();
    });
  });

  describe("restartIce", () => {
    it("calls createRestartOffer and emits signal-offer", async () => {
      await controller.restartIce();
      expect(createRestartOffer).toHaveBeenCalled();
      expect(emitSignalOffer).toHaveBeenCalledWith(
        expect.objectContaining({ type: "offer", iceRestart: true })
      );
    });
  });
});
