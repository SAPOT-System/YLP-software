"use client";

import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type UserNode = {
  user_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  username: string;
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

export default function MapLibre({ data }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapReady = useRef(false); // ✅ FIX ADDED

  const markersRef = useRef<
    Record<string, { marker: maplibregl.Marker; dot: HTMLDivElement }>
  >({});

  const [selectedUser, setSelectedUser] = useState<UserNode | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [showPath, setShowPath] = useState(false);

  // ---------------- MAP INIT ----------------
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "http://localhost:8080/styles/basic-preview/style.json",
      center: [121.0581, 13.7573],
      zoom: 12,
    });

    map.current.on("load", () => {
      mapReady.current = true; // ✅ READY FLAG SET

      map.current!.addSource("history-path", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.current!.addLayer({
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

    return () => map.current?.remove();
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

          const res = await fetch(
            `/api/get-gps/history?userId=${node.user_id}`
          );
          const json: HistoryPoint[] = await res.json();

          setHistory(json);
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

  // ---------------- RENDER PATH (FIXED) ----------------
  useEffect(() => {
    if (!map.current || !mapReady.current) return; // ✅ IMPORTANT FIX

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
            width: 300,
            height: "100%",
            background: "white",
            zIndex: 20,
            padding: 16,
            boxShadow: "0 0 10px rgba(0,0,0,0.2)",
          }}
        >
          <h3>User Details</h3>
          <p>
            <b>ID:</b> {selectedUser.user_id}
          </p>
          <p>
            <b>Username:</b> {selectedUser.username}
          </p>

          <button onClick={() => setSelectedUser(null)}>Close</button>
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
