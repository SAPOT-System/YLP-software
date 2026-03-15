import { useEffect, useState } from "react";
import { pingServer } from "../api";

export const usePing = () => {
  const [latency, setLatency] = useState<number | null>();
  const [online, setOnline] = useState<boolean>(false);
  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await pingServer();
      setLatency(result.latency);
      setOnline(result.success);
    }, 5000);

    return () => clearInterval(interval);
  }, []);
  return { latency, online };
};
