"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Search, Activity } from "lucide-react";
import ReusableTable from "@/ui/dashboard/reusable-table";
import { withBasePath } from "@/lib/basePath";

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

type Message = {
  id: string;
  direction: "IN" | "OUT";
  from_number: string;
  to_number: string;
  body: string;
  status: "sent" | "received" | "failed";
  failure_reason: string | null;
  created_at: number;
};

const PAGE_SIZE = 25;

export default function GSMDashboard() {
  const [data, setData] = useState<GSMStats | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchGSMStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(withBasePath("/api/gsm-stats"));

      if (!res.ok) throw new Error("Failed to fetch GSM stats");

      const result = await res.json();
      if (!result || typeof result !== "object") throw new Error("Invalid data format");

      setData(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (page: number = 1) => {
    try {
      setMessagesLoading(true);
      setMessagesError(null);
      
      const offset = (page - 1) * PAGE_SIZE;
      const url = withBasePath(`/api/sms/get-messages?limit=${PAGE_SIZE}&offset=${offset}`);
      
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`Failed to fetch messages (${res.status})`);
      }

      const result = await res.json();

      let messagesData: Message[] = [];
      let total = 0;

      if (result?.messages && Array.isArray(result.messages)) {
        messagesData = result.messages;
        total = result.total || result.messages.length;
      } else if (Array.isArray(result)) {
        messagesData = result;
        total = result.length;
      } else {
        throw new Error("Invalid response format");
      }

      setMessages(messagesData);
      setTotalMessages(total);
      setCurrentPage(page);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      setMessagesError(errorMessage);
      setMessages([]);
      setTotalMessages(0);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    fetchGSMStats();
    fetchMessages(1);
  }, []);

  const handleRetry = () => {
    fetchGSMStats();
    fetchMessages(1);
  };

  const handlePageChange = (page: number) => {
    fetchMessages(page);
  };

  const direction = data ? Object.entries(data.direction || {}) : [];
  const status = data ? Object.entries(data.status || {}) : [];
  const failures = data ? Object.entries(data.failure_reasons || {}) : [];

  const filteredMessages = messages.filter((msg) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      msg.id.toLowerCase().includes(searchLower) ||
      msg.from_number.toLowerCase().includes(searchLower) ||
      msg.to_number.toLowerCase().includes(searchLower) ||
      msg.body.toLowerCase().includes(searchLower) ||
      msg.status.toLowerCase().includes(searchLower) ||
      msg.direction.toLowerCase().includes(searchLower) ||
      (msg.failure_reason?.toLowerCase().includes(searchLower) ?? false)
    );
  });

  const totalPages = Math.max(1, Math.ceil(totalMessages / PAGE_SIZE));

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent":
      case "received":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getDirectionColor = (direction: string) => {
    return direction === "IN" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800";
  };

  const messageColumns = [
    {
      header: "Timestamp",
      key: "created_at" as const,
      render: (value: number) => formatDate(value),
    },
    {
      header: "Direction",
      key: "direction" as const,
      render: (value: string) => (
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDirectionColor(value)}`}>
          {value}
        </span>
      ),
    },
    {
      header: "From",
      key: "from_number" as const,
    },
    {
      header: "To",
      key: "to_number" as const,
    },
    {
      header: "Message",
      key: "body" as const,
      render: (value: string) => (
        <span className="truncate max-w-xs" title={value}>
          {value}
        </span>
      ),
    },
    {
      header: "Status",
      key: "status" as const,
      render: (value: string) => (
        <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(value)}`}>
          {value}
        </span>
      ),
    },
    {
      header: "Failure Reason",
      key: "failure_reason" as const,
      render: (value: string | null) => (
        <span className="text-sm">{value || "—"}</span>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      {/* ───────── HEADER ───────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">GSM Management</h1>
          <button
            onClick={handleRetry}
            disabled={loading || messagesLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <RefreshCw size={16} className={loading || messagesLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ───────── MAIN CONTENT ───────── */}
      <div className="p-8">
        {/* ───────── SYSTEM STATUS CARDS ───────── */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3 items-start">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900 font-semibold">Failed to load GSM stats</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {!error && data && (
          <>
            {/* Status Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              {/* Connection Status */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                <p className="text-gray-600 text-sm font-medium mb-2">Connection Status</p>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${data.connected ? "bg-green-500" : "bg-red-500"}`}></div>
                  <p className="text-lg font-semibold text-gray-900">
                    {data.connected ? "Connected" : "Disconnected"}
                  </p>
                </div>
              </div>

              {/* GSM Ready */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                <p className="text-gray-600 text-sm font-medium mb-2">GSM Ready</p>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${data.gsm_ready ? "bg-green-500" : "bg-yellow-500"}`}></div>
                  <p className="text-lg font-semibold text-gray-900">
                    {data.gsm_ready ? "Ready" : "Not Ready"}
                  </p>
                </div>
              </div>

              {/* Queue Depth */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                <p className="text-gray-600 text-sm font-medium mb-2">Queue Depth</p>
                <p className="text-3xl font-bold text-blue-600">{data.queue_depth}</p>
              </div>

              {/* Total Messages */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                <p className="text-gray-600 text-sm font-medium mb-2">Total Messages</p>
                <p className="text-3xl font-bold text-gray-900">{data.total_messages}</p>
              </div>

              {/* Port Info */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                <p className="text-gray-600 text-sm font-medium mb-2">Port / Baud</p>
                <p className="text-lg font-semibold text-gray-900">{data.port}</p>
                <p className="text-sm text-gray-500">{data.baud} baud</p>
              </div>
            </div>

            {/* ───────── MESSAGE DIRECTION ───────── */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Message Direction</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {direction.length > 0 ? (
                  direction.map(([key, val]) => (
                    <div key={key} className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                      <p className="text-gray-600 text-sm font-medium mb-2">{key}</p>
                      <p className="text-3xl font-bold text-gray-900">{val.count}</p>
                      <p className="text-sm text-gray-500 mt-1">{val.percent}% of total</p>
                    </div>
                  ))
                ) : (
                  <p className="col-span-2 text-gray-500 py-4">No direction data available</p>
                )}
              </div>
            </div>

            {/* ───────── DELIVERY STATUS ───────── */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {status.length > 0 ? (
                  status.map(([key, val]) => (
                    <div key={key} className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                      <p className="text-gray-600 text-sm font-medium mb-2 capitalize">{key}</p>
                      <p className="text-3xl font-bold text-gray-900">{val.count}</p>
                      <p className="text-sm text-gray-500 mt-1">{val.percent}% of total</p>
                    </div>
                  ))
                ) : (
                  <p className="col-span-3 text-gray-500 py-4">No status data available</p>
                )}
              </div>
            </div>

            {/* ───────── FAILURE ANALYTICS ───────── */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Failure Reasons</h2>
              {failures.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <p className="text-green-700 font-semibold">✓ No failures</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Reason</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Count</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Percent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {failures.map(([key, val]) => (
                        <tr key={key} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-3 text-sm text-gray-900">{key}</td>
                          <td className="px-6 py-3 text-sm font-medium text-gray-900">{val.count}</td>
                          <td className="px-6 py-3 text-sm text-gray-600">{val.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* ───────── MESSAGES TABLE ───────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
            <div className="text-sm text-gray-600">
              Page {currentPage} of {totalPages} • {searchTerm ? `${filteredMessages.length} filtered` : `${totalMessages} total`}
            </div>
          </div>

          {messagesError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3 items-start">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-900 font-semibold">Failed to load messages</p>
                <p className="text-red-700 text-sm mt-1">{messagesError}</p>
              </div>
            </div>
          )}

          {!messagesError && (
            <>
              {/* Search Bar */}
              <div className="relative mb-4">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by ID, number, message, status..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Messages Table */}
              <ReusableTable
                columns={messageColumns}
                data={filteredMessages}
                isLoading={messagesLoading}
                emptyMessage={searchTerm ? "No messages match your search" : "No messages available"}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
