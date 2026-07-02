import { DeviceEventEmitter } from "react-native";
import InCallManager from "react-native-incall-manager";
import { CallAudioService } from "../call-audio-service";

describe("CallAudioService", () => {
  let audioService: CallAudioService;

  beforeEach(() => {
    jest.clearAllMocks();
    audioService = new CallAudioService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates an instance extending TypedEventEmitter", () => {
      expect(audioService).toBeInstanceOf(CallAudioService);
      expect(audioService.on).toBeDefined();
      expect(audioService.emit).toBeDefined();
      expect(audioService.removeListener).toBeDefined();
    });
  });

  describe("updateAvailableRoutes", () => {
    it("emits audio-routes-updated with earpiece and speaker always available", () => {
      const listener = jest.fn();
      audioService.on("audio-routes-updated", listener);

      audioService.updateAvailableRoutes();

      expect(listener).toHaveBeenCalledWith({
        routes: expect.arrayContaining([
          { type: "earpiece", label: "Earpiece" },
          { type: "speaker", label: "Speaker" },
        ]),
      });
    });

    it("does not include bluetooth or headset when not connected", () => {
      const listener = jest.fn();
      audioService.on("audio-routes-updated", listener);

      audioService.updateAvailableRoutes();

      const payload = listener.mock.calls[0][0] as {
        routes: { type: string; label: string }[];
      };
      const types = payload.routes.map((r) => r.type);
      expect(types).not.toContain("bluetooth");
      expect(types).not.toContain("headset");
    });
  });

  describe("setAudioRoute", () => {
    it("calls InCallManager.setForceSpeakerphoneOn(true) for speaker route", async () => {
      await audioService.setAudioRoute("speaker");

      expect(InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(true);
    });

    it("calls InCallManager.setForceSpeakerphoneOn(false) for earpiece route", async () => {
      await audioService.setAudioRoute("earpiece");

      expect(InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(false);
    });

    it("calls InCallManager.setForceSpeakerphoneOn(false) for headset route", async () => {
      await audioService.setAudioRoute("headset");

      expect(InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(false);
    });

    it("calls InCallManager.setForceSpeakerphoneOn(false) for bluetooth route", async () => {
      await audioService.setAudioRoute("bluetooth");

      expect(InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(false);
    });

    it("emits audio-route-changed after setting route", async () => {
      const listener = jest.fn();
      audioService.on("audio-route-changed", listener);

      await audioService.setAudioRoute("speaker");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ route: "speaker" })
      );
    });

    it("emits audio-route-changed with available routes", async () => {
      audioService.updateAvailableRoutes();
      const listener = jest.fn();
      audioService.on("audio-route-changed", listener);

      await audioService.setAudioRoute("earpiece");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          route: "earpiece",
          available: expect.arrayContaining([
            { type: "earpiece", label: "Earpiece" },
            { type: "speaker", label: "Speaker" },
          ]),
        })
      );
    });
  });

  describe("toggleSpeaker", () => {
    it("switches to speaker when current route is earpiece", async () => {
      await audioService.setAudioRoute("earpiece");
      jest.clearAllMocks();

      const listener = jest.fn();
      audioService.on("audio-route-changed", listener);

      audioService.toggleSpeaker();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ route: "speaker" })
      );
    });

    it("switches to earpiece when current route is speaker", async () => {
      await audioService.setAudioRoute("speaker");
      jest.clearAllMocks();

      const listener = jest.fn();
      audioService.on("audio-route-changed", listener);

      audioService.toggleSpeaker();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ route: "earpiece" })
      );
    });
  });

  describe("setupAudioEventListeners", () => {
    it("subscribes to DeviceEventEmitter events", () => {
      const addListenerSpy = jest.spyOn(DeviceEventEmitter, "addListener");

      audioService.setupAudioEventListeners();

      expect(addListenerSpy).toHaveBeenCalledWith(
        "WiredHeadset",
        expect.any(Function)
      );
      expect(addListenerSpy).toHaveBeenCalledWith(
        "BluetoothHeadset",
        expect.any(Function)
      );
      expect(addListenerSpy).toHaveBeenCalledWith(
        "Proximity",
        expect.any(Function)
      );
    });

    it("does not register duplicate listeners when called twice", () => {
      const addListenerSpy = jest.spyOn(DeviceEventEmitter, "addListener");

      audioService.setupAudioEventListeners();
      const countAfterFirst = addListenerSpy.mock.calls.length;

      audioService.setupAudioEventListeners();

      expect(addListenerSpy.mock.calls.length).toBe(countAfterFirst);
    });
  });

  describe("removeAudioEventListeners", () => {
    it("removes all subscriptions", () => {
      const mockRemove = jest.fn();
      jest
        .spyOn(DeviceEventEmitter, "addListener")
        .mockReturnValue({ remove: mockRemove } as unknown as ReturnType<
          typeof DeviceEventEmitter.addListener
        >);

      audioService.setupAudioEventListeners();
      audioService.removeAudioEventListeners();

      expect(mockRemove).toHaveBeenCalledTimes(3);
    });
  });
});
