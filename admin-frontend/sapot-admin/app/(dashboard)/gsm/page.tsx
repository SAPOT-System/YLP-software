"use client";

import { useEffect, useState } from "react";

type PercentBlock = {
  count: number;
  percent: number;
};

type GSMStats = {
  gsm_ready: boolean;
  connected: boolean;
  last_status: string;
  queue_depth: number;
  port: string;
  baud: number;
  total_messages: number;
  direction: Record<string, PercentBlock>;
  status: Record<string, PercentBlock>;
  failure_reasons: Record<string, PercentBlock>;
};

export default function GSMDashboard() {
  const [data, setData] = useState<GSMStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gsm-stats")
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-sm">Loading GSM stats...</div>;
  if (!data) return <div className="p-6 text-red-500">Failed to load data</div>;

  const direction = Object.entries(data.direction);
  const status = Object.entries(data.status);
  const failures = Object.entries(data.failure_reasons);

  return (
    <div className="p-6 space-y-10 text-sm">

      {/* ───────── HEADER / SYSTEM HEALTH ───────── */}
      <div className="border rounded-lg p-4 space-y-2">
        <h1 className="text-lg font-semibold">GSM System Dashboard</h1>

        <div className="flex gap-6 flex-wrap text-gray-700">
          <span>
            Status:{" "}
            <b className={data.connected ? "text-green-600" : "text-red-600"}>
              {data.connected ? "CONNECTED" : "DISCONNECTED"}
            </b>
          </span>

          <span>
            GSM Ready:{" "}
            <b className={data.gsm_ready ? "text-green-600" : "text-yellow-600"}>
              {String(data.gsm_ready).toUpperCase()}
            </b>
          </span>

          <span>Queue: <b>{data.queue_depth}</b></span>
          <span>Total Messages: <b>{data.total_messages}</b></span>
        </div>

        <div className="text-gray-500">
          <div>Port: {data.port}</div>
          <div>Baud: {data.baud}</div>
          <div>Last Status: {data.last_status}</div>
        </div>
      </div>

      {/* ───────── MESSAGE DIRECTION ───────── */}
      <section className="space-y-3">
        <h2 className="text-md font-semibold">Message Direction</h2>

        <div className="grid grid-cols-2 gap-4">
          {direction.map(([key, val]) => (
            <div key={key} className="border rounded p-3">
              <div className="font-medium">{key}</div>
              <div className="text-gray-600">
                {val.count} messages ({val.percent}%)
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── DELIVERY STATUS ───────── */}
      <section className="space-y-3">
        <h2 className="text-md font-semibold">Delivery Status</h2>

        <div className="grid grid-cols-3 gap-4">
          {status.map(([key, val]) => (
            <div key={key} className="border rounded p-3">
              <div className="font-medium capitalize">{key}</div>
              <div className="text-gray-600">
                {val.count} ({val.percent}%)
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── FAILURE ANALYTICS ───────── */}
      <section className="space-y-3">
        <h2 className="text-md font-semibold">Failure Reasons</h2>

        {failures.length === 0 ? (
          <div className="text-green-600 border rounded p-3">
            No failures 🎉
          </div>
        ) : (
          <table className="w-full border text-left">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2">Reason</th>
                <th className="p-2">Count</th>
                <th className="p-2">Percent</th>
              </tr>
            </thead>
            <tbody>
              {failures.map(([key, val]) => (
                <tr key={key} className="border-t">
                  <td className="p-2">{key}</td>
                  <td className="p-2">{val.count}</td>
                  <td className="p-2">{val.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

    </div>
  );
}
