"use client";

import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Maximize, Minimize, Lock, Unlock } from "lucide-react";

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp + "Z");

  // Exact readable format
  const formatted = date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  // Relative time
  const diff = Date.now() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  let relative = "";

  if (seconds < 60) relative = `${seconds}s ago`;
  else if (minutes < 60) relative = `${minutes}m ago`;
  else if (hours < 24) relative = `${hours}h ago`;
  else relative = `${days}d ago`;

  return { formatted, relative };
}

function getLastActiveStatus(timestamp: string) {
  const diff = Date.now() - new Date(timestamp + "Z").getTime();

  if (diff < 60 * 1000) {
    return { label: "Live", color: "#34c759" }; // green
  } else if (diff < 5 * 60 * 1000) {
    return { label: "Recent", color: "#ffcc00" }; // yellow
  } else {
    return { label: "Offline", color: "#ff3b30" }; // red
  }
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          background: "#f5f5f5",
          padding: "6px 8px",
          borderRadius: 6,
        }}
      >
        {value ?? "-"}
      </span>
    </div>
  );
}

export type UserNode = {
  user_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  username: string;
  /** "admin" | "rescuer" | "user" — drives the marker shape/colour. */
  role?: string;
};

type UserData = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  "id": string,
  "phone_number": string,
  "email": string,
  "rescuer": Boolean,
  "admin": Boolean
};

type HistoryPoint = {
  latitude: number;
  longitude: number;
  user_id: string;
  id: string;
  timestamp: string;
};

type Props = {
  data: UserNode[];
};

const GAP_THRESHOLD = 60 * 1000; // 1 min

/**
 * Marker CSS modifier per role. Role vocabulary matches the server's
 * `_resolve_role`; the shapes/colours live in app/globals.css.
 * A plain "user" needs no modifier — the base .custom-marker is its style.
 */
const ROLE_MARKER_CLASSES = ["rescuer", "admin"] as const;

function applyRoleClass(dot: HTMLDivElement, role?: string) {
  ROLE_MARKER_CLASSES.forEach((roleClass) => {
    dot.classList.toggle(roleClass, role === roleClass);
  });
}

// ✅ wait + retry for style (IMPORTANT)
async function waitForStyle(url: string, retries = 10, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {}

    await new Promise((r) => setTimeout(r, delay));
  }

  throw new Error("Style never became available");
}

export default function MapLibre({ data }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapReady = useRef(false);

  const markersRef = useRef<
    Record<string, { marker: maplibregl.Marker; dot: HTMLDivElement }>
  >({});

  const [selectedUser, setSelectedUser] = useState<UserNode | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [showPath, setShowPath] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserNode[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  useEffect(() => {
    if (!isLocked || !selectedUser || !map.current) return;

    const updatedUser = data.find(
      (u) => u.user_id === selectedUser.user_id
    );

    if (!updatedUser) return;

    map.current.flyTo({
      center: [updatedUser.longitude, updatedUser.latitude],
      zoom: 16,
      speed: 1,
    });

    // keep selectedUser fresh too
    setSelectedUser(updatedUser);
  }, [data, isLocked, selectedUser]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const results = data.filter((u) =>
      u.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    setSearchResults(results.slice(0, 5));
  }, [searchTerm, data]);

  const handleSelectUser = async (node: UserNode) => {
    setSelectedUser(node);

    const [historyRes, userRes] = await Promise.all([
      fetch(`/api/get-gps/history?userId=${node.user_id}`),
      fetch(`/api/get-user-info?userId=${node.user_id}`)
    ]);

    const [historyJson, userJson] = await Promise.all([
      historyRes.json(),
      userRes.json()
    ]);

    setHistory(historyJson);
    setUserData(userJson);

    map.current?.flyTo({
      center: [node.longitude, node.latitude],
      zoom: 16,
      speed: 1.2,
    });

    setSearchTerm("");
    setSearchResults([]);
  };

  // ---------------- MAP INIT (FIXED) ----------------
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let isMounted = true;

    const initMap = async () => {
      try {
        const styleURL =
          process.env.NEXT_PUBLIC_MAP_STYLE ||
            "https://localhost/tiles/styles/basic-preview/style.json";

        // ✅ wait until style server is ready
        const styleJSON = await waitForStyle(styleURL);

        if (!isMounted) return;

        const mapInstance = new maplibregl.Map({
          container: mapContainer.current!,
          style: styleJSON, // ✅ pass JSON instead of URL
          center: [121.0581, 13.7573],
          zoom: 12,
        });

        map.current = mapInstance;

        mapInstance.on("load", () => {
          mapReady.current = true;

          // ✅ fix blank map on first render
          mapInstance.resize();

          mapInstance.addSource("history-path", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [],
            },
          });

          mapInstance.addLayer({
            id: "history-path-line",
            type: "line",
            source: "history-path",
            layout: {
              "line-join": "round",
              "line-cap": "round",
              visibility: "none",
            },
            paint: {
              "line-color": "#ff3b30",
              "line-width": 3,
              "line-opacity": 0.8,
            },
          });
        });

        // optional debug
        mapInstance.on("error", (e) => {
          console.error("Map error:", e);
        });
      } catch (err) {
        console.error("Map initialization failed:", err);
      }
    };

    initMap();

    return () => {
      isMounted = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // ---------------- MARKERS ----------------
  useEffect(() => {
    if (!map.current) return;

    const existing = markersRef.current;

    data.forEach((node) => {
      const isInactive =
        Date.now() - new Date(node.timestamp + "Z").getTime() >
          5 * 60 * 1000;

      if (existing[node.user_id]) {
        const { marker, dot } = existing[node.user_id];

        marker.setLngLat([node.longitude, node.latitude]);
        dot.classList.toggle("inactive", isInactive);
        // Role can change between polls (a user is promoted to rescuer),
        // so re-apply it rather than only setting it at creation time.
        applyRoleClass(dot, node.role);
      } else {
        const wrapper = document.createElement("div");
        wrapper.className = "marker-wrapper";

        const dot = document.createElement("div");
        dot.className = "custom-marker";
        applyRoleClass(dot, node.role);

        const label = document.createElement("div");
        label.className = "marker-label";
        label.innerText = node.username;

        wrapper.appendChild(dot);
        wrapper.appendChild(label);

        dot.classList.toggle("inactive", isInactive);

        wrapper.addEventListener("click", async () => {
          setSelectedUser(node);
	  setIsLocked(true);
	  const [history, userdata] = await Promise.all([
	    fetch(`/api/get-gps/history?userId=${node.user_id}`),
	    fetch(`/api/get-user-info?userId=${node.user_id}`)
	  ]);

	  const [json, userJson] = await Promise.all([
	    history.json(),
	    userdata.json()
	  ]);


          setHistory(json);
	  setUserData(userJson)
        });

        const marker = new maplibregl.Marker({
          element: wrapper,
          anchor: "center",
        })
          .setLngLat([node.longitude, node.latitude])
          .addTo(map.current!);

        existing[node.user_id] = { marker, dot };
      }
    });

    Object.keys(existing).forEach((id) => {
      if (!data.find((d) => d.user_id === id)) {
        existing[id].marker.remove();
        delete existing[id];
      }
    });
  }, [data]);

  // ---------------- PATH BUILDING ----------------
  function buildSegments(data: HistoryPoint[]) {
    const sorted = [...data].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const segments: HistoryPoint[][] = [];
    let current: HistoryPoint[] = [];

    sorted.forEach((p, i) => {
      if (i === 0) {
        current.push(p);
        return;
      }

      const prev = sorted[i - 1];

      const diff =
        new Date(p.timestamp).getTime() -
          new Date(prev.timestamp).getTime();

      if (diff <= GAP_THRESHOLD) {
        current.push(p);
      } else {
        segments.push(current);
        current = [p];
      }
    });

    if (current.length) segments.push(current);

    return segments;
  }

  function toGeoJSON(segments: HistoryPoint[][]) {
    return {
      type: "FeatureCollection",
      features: segments.map((seg) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: seg.map((p) => [p.longitude, p.latitude]),
        },
        properties: {},
      })),
    };
  }

  // ---------------- RENDER PATH ----------------
  useEffect(() => {
    if (!map.current || !mapReady.current) return;

    const source = map.current.getSource(
      "history-path"
    ) as maplibregl.GeoJSONSource;

    if (!source) return;

    if (!showPath || history.length === 0) {
      map.current.setLayoutProperty(
        "history-path-line",
        "visibility",
        "none"
      );
      return;
    }

    const segments = buildSegments(history);
    const geojson = toGeoJSON(segments);

    source.setData(geojson);

    map.current.setLayoutProperty(
      "history-path-line",
      "visibility",
      "visible"
    );
  }, [history, showPath]);

  // ---------------- UI ----------------
  return (
    <div
      style={{
	position: isFullscreen ? "fixed" : "relative",
	top: isFullscreen ? 0 : undefined,
	left: isFullscreen ? 0 : undefined,
	width: "100%",
	height: isFullscreen ? "100vh" : "500px",
	zIndex: isFullscreen ? 9999 : "auto",
	background: "white",
      }}
    >
      <div
	style={{
	  position: "absolute",
	  zIndex: 15,
	  top: 12,
	  left: 12,
	  display: "flex",
	  alignItems: "center",
	  gap: 10,
	}}
      >
	{/* Show Path Button */}
	<button
	  onClick={() => setShowPath((v) => !v)}
	  style={{
	    padding: "8px 12px",
	    background: "#111",
	    color: "white",
	    borderRadius: 8,
	    border: "none",
	    cursor: "pointer",
	    whiteSpace: "nowrap",
	  }}
	>
	  {showPath ? "Hide Path" : "Show Path"}
	</button>

	{/* Search */}
	<div style={{ position: "relative" }}>
	  <input
	    type="text"
	    placeholder="Search user..."
	    value={searchTerm}
	    onChange={(e) => setSearchTerm(e.target.value)}
	    style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              width: 260,
              background: "white",
	    }}
	  />

	  {searchResults.length > 0 && (
	    <div
              style={{
		position: "absolute",
		top: "110%",
		left: 0,
		right: 0,
		background: "white",
		borderRadius: 10,
		boxShadow: "0 6px 16px rgba(0,0,0,0.15)",
		overflow: "hidden",
              }}
	    >
              {searchResults.map((user) => (
		<div
		  key={user.user_id}
		  onClick={() => {
		    handleSelectUser(user);
		    setIsLocked(true);
		  }}
		  style={{
		    padding: "10px 14px",
		    cursor: "pointer",
		    borderBottom: "1px solid #eee",
		  }}
		>
		  {user.username}
		</div>
              ))}
	    </div>
	  )}
	</div>
	<div
	  style={{
	    zIndex: 15,
	  }}
	>
	  <button
	    onClick={() => {
	      setIsFullscreen((v) => !v);

	      // allow DOM to update first
	      setTimeout(() => {
		map.current?.resize();
	      }, 100);
	    }}
	    title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
	    style={{
	      width: 30,
	      height: 30,
	      borderRadius: "50%",
	      border: "none",
	      cursor: "pointer",
	      display: "flex",
	      alignItems: "center",
	      justifyContent: "center",
	      background: "white",
	      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
	    }}
	  >
	    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
	  </button>
	</div>
	
      </div>

      {selectedUser && (
	<div
	  style={{
	    position: "absolute",
	    bottom: 20,
	    left: 12,
	    zIndex: 15,
	  }}
	  onMouseEnter={(e) =>
	    (e.currentTarget.style.transform = "scale(1.05)")
	  }
	  onMouseLeave={(e) =>
	    (e.currentTarget.style.transform = "scale(1)")
	  }
	>
	  <button
	    onClick={() => setIsLocked((v) => !v)}
	    title={isLocked ? "Unlock user tracking" : "Lock to user"}
	    style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isLocked ? "#007aff" : "white",
              color: isLocked ? "white" : "#333",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              transition: "all 0.2s ease",
	    }}
	  >
	    {isLocked ? <Lock size={20} /> : <Unlock size={20} />}
	  </button>
	</div>
      )}

      {selectedUser && (
	<div
	  style={{
	    position: "absolute",
	    right: 0,
	    top: 0,
	    width: 320,
	    height: "100%",
	    background: "white",
	    zIndex: 20,
	    padding: 20,
	    boxShadow: "0 0 10px rgba(0,0,0,0.2)",
	    display: "flex",
	    flexDirection: "column",
	    gap: 16,
	    overflowY: "auto",
	  }}
	>
	  <h3 style={{ marginBottom: 8 }}>User Details</h3>
	  {(() => {
	    const status = getLastActiveStatus(selectedUser.timestamp);

	    return (
	      <div
		style={{
		  padding: "12px",
		  borderRadius: 10,
		  background: "#f8f8f8",
		  borderLeft: `5px solid ${status.color}`,
		  display: "flex",
		  flexDirection: "column",
		  gap: 4,
		}}
	      >
		<span style={{ fontSize: 12, color: "#666" }}>
								Last Activity
		</span>

		<span style={{ fontSize: 14, fontWeight: 600 }}>
		  {(() => {
		    const time = formatTimestamp(selectedUser.timestamp);

		    return (
		      <>
			<div style={{ fontSize: 14, fontWeight: 600 }}>
			  {time.relative}
			</div>
			<div style={{ fontSize: 12, color: "#666" }}>
			  {time.formatted}
			</div>
		      </>
		    );
		  })()}
		</span>

		<span
		  style={{
		    fontSize: 13,
		    fontWeight: 600,
		    color: status.color,
		  }}
		>
		   ● {status.label}
		</span>
	      </div>
	    );
	  })()}
	  {/* Basic Info */}
	  <div>
	    <h4 style={{ marginBottom: 6, fontSize: 14, color: "#666" }}>
									   Basic Info
	    </h4>

	    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Field label="User ID" value={selectedUser.user_id} />
              <Field label="Username" value={selectedUser.username} />
              <Field label="Latitude" value={selectedUser.latitude} />
              <Field label="Longitude" value={selectedUser.longitude} />
	      
	    </div>
	  </div>

	  {/* Extra User Data */}
	  {userData && (
	    <div>
              <h4 style={{ marginBottom: 6, fontSize: 14, color: "#666" }}>
									     Account Info
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
		<Field label="First Name" value={userData.first_name} />
		<Field label="Last Name" value={userData.last_name} />
		<Field label="Email" value={userData.email} />
		<Field label="Phone" value={userData.phone_number} />
		<Field
		  label="Role"
		  value={
		    userData.admin
                      ? "Admin"
                      : userData.rescuer
                      ? "Rescuer"
                      : "User"
		  }
		/>
              </div>
	    </div>
	  )}

	  <button
	    onClick={() => setSelectedUser(null)}
	    style={{
              marginTop: "auto",
              padding: "8px 12px",
              background: "#111",
              color: "white",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
	    }}
	  >
	     Close
	  </button>
	</div>
      )}
      
      <div
        ref={mapContainer}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: !isFullscreen ? "25px": "0px",
          overflow: "hidden",
          position: "relative",
        }}
      />
    </div>
  );
}
