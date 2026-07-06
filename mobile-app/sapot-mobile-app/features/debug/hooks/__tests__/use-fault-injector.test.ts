import { act, renderHook } from "@testing-library/react-native";
import { faultInjector } from "../../services/fault-injector";
import { useFaultInjector } from "../use-fault-injector";

describe("useFaultInjector", () => {
  afterEach(() => {
    faultInjector.setOfflineFlag("noInternet", false);
    faultInjector.setOfflineFlag("lanDown", false);
    faultInjector.setOfflineFlag("serverDown", false);
    faultInjector.setOfflineFlag("redisDown", false);
    faultInjector.setOfflineFlag("authDown", false);
    faultInjector.setOfflineFlag("syncDown", false);
    faultInjector.resetNetworkFaults("tcp");
    faultInjector.resetNetworkFaults("ws");
  });

  it("reads the current offline flags from the shared FaultInjector", () => {
    const { result } = renderHook(() => useFaultInjector());
    expect(result.current.offlineFlags.serverDown).toBe(false);
  });

  it("reads the current network faults for tcp and ws", () => {
    const { result } = renderHook(() => useFaultInjector());
    expect(result.current.networkFaults.tcp).toEqual({
      latencyMs: 0,
      lossRate: 0,
      dupRate: 0,
      corruptRate: 0,
    });
    expect(result.current.networkFaults.ws).toEqual({
      latencyMs: 0,
      lossRate: 0,
      dupRate: 0,
      corruptRate: 0,
    });
  });

  it("setOfflineFlag updates the flag and re-renders the hook", () => {
    const { result } = renderHook(() => useFaultInjector());

    act(() => {
      result.current.setOfflineFlag("serverDown", true);
    });

    expect(result.current.offlineFlags.serverDown).toBe(true);
  });

  it("setNetworkFaults updates the transport's faults and re-renders the hook", () => {
    const { result } = renderHook(() => useFaultInjector());

    act(() => {
      result.current.setNetworkFaults("tcp", { latencyMs: 200 });
    });

    expect(result.current.networkFaults.tcp.latencyMs).toBe(200);
  });

  it("resetNetworkFaults clears a transport back to defaults", () => {
    const { result } = renderHook(() => useFaultInjector());

    act(() => {
      result.current.setNetworkFaults("ws", { lossRate: 0.5 });
    });
    act(() => {
      result.current.resetNetworkFaults("ws");
    });

    expect(result.current.networkFaults.ws.lossRate).toBe(0);
  });

  it("reflects changes made directly on the shared faultInjector instance", () => {
    const { result } = renderHook(() => useFaultInjector());

    act(() => {
      faultInjector.setOfflineFlag("lanDown", true);
    });

    expect(result.current.offlineFlags.lanDown).toBe(true);
  });
});
