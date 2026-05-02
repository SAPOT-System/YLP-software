"use client";

import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

type UserNode = {
  user_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  username: string;
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

  // ---------------- MAP INIT (FIXED) ----------------
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let isMounted = true;

    const initMap = async () => {
      try {
        const styleURL =
          process.env.NEXT_PUBLIC_MAP_STYLE ||
            "http://localhost:8080/styles/basic-preview/style.json";

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
      } else {
        const wrapper = document.createElement("div");
        wrapper.className = "marker-wrapper";

        const dot = document.createElement("div");
        dot.className = "custom-marker";

        const label = document.createElement("div");
        label.className = "marker-label";
        label.innerText = node.username;

        wrapper.appendChild(dot);
        wrapper.appendChild(label);

        dot.classList.toggle("inactive", isInactive);

        wrapper.addEventListener("click", async () => {
          setSelectedUser(node);
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
    <div style={{ position: "relative", width: "100%" }}>
      <button
        onClick={() => setShowPath((v) => !v)}
        style={{
          position: "absolute",
          zIndex: 10,
          margin: 12,
          padding: "6px 10px",
          background: "#111",
          color: "white",
          borderRadius: 8,
        }}
      >
        {showPath ? "Hide Path" : "Show Path"}
      </button>

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
              <Field label="Last Update" value={selectedUser.timestamp} />
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
          height: "500px",
          borderRadius: "25px",
          overflow: "hidden",
          position: "relative",
        }}
      />
    </div>
  );
}
