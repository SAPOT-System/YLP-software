"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: "low" | "normal" | "high";
  target_audience: "user" | "rescuer" | "admin";
  status: "active" | "expired";
  expires_at: string;
  created_at: string;
};

export default function AnnouncementsPage() {
  const [data, setData] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    total_pages: 1,
    has_prev: false,
    has_next: false,
  });
  const [confirm, setConfirm] = useState<{
    open: boolean;
    type: "create" | "update" | "delete" | null;
    onConfirm: (() => void) | null;
    message: string;
  }>({
    open: false,
    type: null,
    onConfirm: null,
    message: "",
  });

  const openConfirm = (
    type: "create" | "update" | "delete",
    message: string,
    onConfirm: () => void
  ) => {
    setConfirm({
      open: true,
      type,
      message,
      onConfirm,
    });
  };

  const limit = 20;

  const badgeStyle = (color: string) => ({
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
    background: color,
    color: "white",
  });

  // Controlled form state
  const [form, setForm] = useState({
    title: "",
    content: "",
    priority: "normal",
    target_audience: "user",
    status: "active",
    expires_at: "",
  });
  
  useEffect(() => {
    setMounted(true)
    fetchAnnouncements(1);
  }, []);

  const fetchAnnouncements = async (pageNumber = 1, keyword="") => {
    setLoading(true);
    const offset = (pageNumber - 1) * limit;
    const res = await fetch(`/api/announcements?limit=${limit}&offset=${offset}&keyword=${keyword}`);
    const json = await res.json();

    setData(json.announcements || []);
    setPagination({
      page: json.page,
      total_pages: json.total_pages,
      has_prev: json.has_prev,
      has_next: json.has_next,
    });
    setPage(pageNumber);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    fetchAnnouncements(page);
  };

  const submitAnnouncement = async () => {
    const payload = {
      title: form.title,
      content: form.content,
      priority: form.priority,
      target_audience: form.target_audience,
      status: form.status,
      expires_at: new Date(form.expires_at).toISOString(),
    };

    if (editing) {
      await fetch(`/api/announcements/${editing.id}`, {
	method: "PATCH",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/announcements/create`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(payload),
      });
    }

    setIsModalOpen(false);
    setEditing(null);
    fetchAnnouncements(page);
  };

  const handleSubmit = async () => {
    const payload = {
      title: form.title,
      content: form.content,
      priority: form.priority,
      target_audience: form.target_audience,
      status: form.status,
      expires_at: new Date(form.expires_at).toISOString(),
    };

    if (editing) {
      await fetch(`/api/announcements/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/announcements/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setIsModalOpen(false);
    setEditing(null);
    setForm({
      title: "",
      content: "",
      priority: "normal",
      target_audience: "user",
      status: "active",
      expires_at: "",
    });

    fetchAnnouncements(page);
  };

  const openEditModal = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      content: a.content,
      priority: a.priority,
      target_audience: a.target_audience,
      status: a.status,
      expires_at: a.expires_at.slice(0, 16),
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditing(null);
    setForm({
      title: "",
      content: "",
      priority: "normal",
      target_audience: "user",
      status: "active",
      expires_at: "",
    });
    setIsModalOpen(true);
  };

  const inputStyle: React.CSSProperties = {
    padding: "10px",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 14,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#666",
  };
  return (
    <div style={{ padding: 20, minHeight: "100vh" }}>
      {/* Modal */}
      {confirm.open && (
	<div
	  style={{
	    position: "fixed",
	    inset: 0,
	    backgroundColor: "rgba(0,0,0,0.4)",
	    display: "flex",
	    alignItems: "center",
	    justifyContent: "center",
	    zIndex: 1100,
	  }}
	>
	  <div
	    style={{
              background: "white",
              padding: 20,
              borderRadius: 12,
              width: 360,
              display: "flex",
              flexDirection: "column",
              gap: 12,
	    }}
	  >
	    <h4 style={{ margin: 0 }}>Confirm Action</h4>

	    <p style={{ fontSize: 14, color: "#555" }}>{confirm.message}</p>

	    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
		onClick={() =>
		  setConfirm({
		    open: false,
		    type: null,
		    onConfirm: null,
		    message: "",
		  })
		}
		style={{
		  padding: "6px 10px",
		  borderRadius: 8,
		  border: "1px solid #ddd",
		  background: "white",
		  cursor: "pointer",
		}}
              >
		 Cancel
              </button>

              <button
		onClick={() => {
		  confirm.onConfirm?.();
		  setConfirm({
		    open: false,
		    type: null,
		    onConfirm: null,
		    message: "",
		  });
		}}
		style={{
		  padding: "6px 10px",
		  borderRadius: 8,
		  border: "none",
		  background:
              confirm.type === "delete" ? "#ef4444" : "#3b82f6",
		  color: "white",
		  cursor: "pointer",
		}}
              >
		 Confirm
              </button>
	    </div>
	  </div>
	</div>
      )}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 14,
              maxWidth: 500,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: 0 }}>{editing ? "Edit Announcement" : "Create Announcement"}</h3>

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Title</label>
              <input
                placeholder="Enter title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                style={inputStyle}
              />
            </div>

            {/* Content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Content</label>
              <textarea
                placeholder="Write announcement..."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                style={{ ...inputStyle, height: 90, resize: "none" }}
              />
            </div>

            {/* Priority + Audience */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  style={inputStyle}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Audience</label>
                <select
                  value={form.target_audience}
                  onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                  style={inputStyle}
                >
                  <option value="user">User</option>
                  <option value="rescuer">Rescuer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {/* Status + Expiry */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  style={inputStyle}
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Expires At</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() =>
		  openConfirm(
		    editing ? "update" : "create",
		    editing
		      ? "Are you sure you want to update this announcement?"
		      : "Are you sure you want to create this announcement?",
		    submitAnnouncement
		  )}
                style={{
                  background: "#3b82f6",
                  color: "white",
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          placeholder="Search"
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
	  onChange={(e) => fetchAnnouncements(1, e.target.value)}
        />
        <button
          onClick={openCreateModal}
          style={{
            background: "#3b82f6",
            color: "white",
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
          }}
        >
          + Create New Announcement
        </button>
      </div>

      {/* List */}
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ marginBottom: 20, fontWeight: 700 }}>Announcements</h2>

        {!mounted || loading  ? (
          <p>Loading...</p>
        ) : (
          data.map((a) => (
            <div
              key={a.id}
              style={{
                borderBottom: "1px solid #eee",
                padding: "16px 0",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{a.title}</span>

                <span
                  style={badgeStyle(
                    a.priority === "high"
                      ? "#ef4444"
                      : a.priority === "normal"
                      ? "#3b82f6"
                      : "#10b981"
                  )}
                >
                  {a.priority}
                </span>
              </div>

              <div
                style={{
                  color: "#555",
                  fontSize: 14,
                  fontWeight: 400,
                  lineHeight: "1.4",
                }}
              >
                {a.content}
              </div>

              <p
                style={{
                  fontSize: 12,
                  color: "#999",
                  marginTop: 6,
                  fontWeight: 400,
                }}
              >
		{`Posted on ${a.created_at.slice(0, 10)}`}
              </p>

              {/* Actions (BOTTOM RIGHT) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <button
                  onClick={() => openEditModal(a)}
                  style={{
                    background: "transparent",
                    border: "1px solid #3b82f6",
                    color: "#3b82f6",
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>

                <button
                  onClick={() => openConfirm(
		    "delete",
		    "Are you sure you want to delete this announcement? This action cannot be undone.",
		    () => handleDelete(a.id)
		  )}
                  style={{
                    background: "transparent",
                    border: "1px solid #ef4444",
                    color: "#ef4444",
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div
	style={{
	  display: "flex",
	  justifyContent: "space-between",
	  alignItems: "center",
	  marginTop: 20,
	}}
      >
	<button
	  disabled={!mounted || !pagination.has_prev}
	  onClick={() => fetchAnnouncements(pagination.page - 1)}
	  style={{
	    padding: "6px 12px",
	    borderRadius: 8,
	    border: "1px solid #ddd",
	    background: mounted && pagination.has_prev ? "white" : "#f5f5f5",
	    cursor: mounted && pagination.has_prev ? "pointer" : "not-allowed",
	    fontSize: 13,
	  }}
	>
	   Previous
	</button>

	<div style={{ fontSize: 13, color: "#666" }}>
						       Page <b>{mounted ? pagination.page : 1}</b> / {mounted ? pagination.total_pages : 1}
	</div>

	<button
	  disabled={!mounted || !pagination.has_next}
	  onClick={() => fetchAnnouncements(pagination.page + 1)}
	  style={{
	    padding: "6px 12px",
	    borderRadius: 8,
	    border: "1px solid #ddd",
	    background: mounted && pagination.has_next ? "white" : "#f5f5f5",
	    cursor: mounted && pagination.has_next ? "pointer" : "not-allowed",
	    fontSize: 13,
	  }}
	>
	   Next
	</button>
      </div>
    </div>
  );
}
