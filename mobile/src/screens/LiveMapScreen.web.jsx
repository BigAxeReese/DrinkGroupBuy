import { useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DistanceRadiusFilter } from "../components/DistanceRadiusFilter";
import { useDevLocationConfig } from "../hooks/useDevLocationConfig";
import { mapCenter, mapDefaults } from "../mock/mapConfig";
import { calculateDistanceKm } from "../utils/distance";
import { reportAppliedDevLocation } from "../utils/devLocationControl";
import { buildStoreMapStores, getStoreMapDestination } from "../utils/groupBuyActivityStores";

export function LiveMapScreen({ navigation, appState, selectedAuthUserId }) {
  const mapElementRef = useRef(null);
  const lastReportSignatureRef = useRef("");
  const mapInstanceRef = useRef(null);
  const googleMapsRef = useRef(null);
  const markersRef = useRef([]);
  const markersByStoreIdRef = useRef(new Map());
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [locationPermission, setLocationPermission] = useState("not_required");
  const [userPosition, setUserPosition] = useState({
    latitude: mapCenter.latitude,
    longitude: mapCenter.longitude
  });
  const [radiusKm, setRadiusKm] = useState(null);
  const { config, enabled: devControlEnabled, syncError, syncStatus } = useDevLocationConfig(selectedAuthUserId);

  const mapStores = useMemo(
    () => buildStoreMapStores(appState?.stores, appState?.groupBuyActivities),
    [appState?.stores, appState?.groupBuyActivities]
  );
  const visibleMapStores = useMemo(() => {
    if (radiusKm == null) return mapStores;
    return mapStores.filter((store) => {
      const distanceKm = calculateDistanceKm(userPosition, store);
      return distanceKm != null && distanceKm <= radiusKm;
    });
  }, [mapStores, radiusKm, userPosition.latitude, userPosition.longitude]);

  const selectedStore = mapStores.find((store) => store.id === selectedStoreId);
  const storeSyncStatus = appState?.storeSyncStatus ?? "idle";
  const storeStatusText = storeSyncStatus === "error"
    ? "店家資料載入失敗"
    : storeSyncStatus === "loading" && mapStores.length === 0
      ? "店家資料載入中..."
      : `${visibleMapStores.length} 間店家`;
  const apiKey = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    || Constants.expoConfig?.extra?.googleMapsWebApiKey
    || Constants.manifest2?.extra?.expoClient?.extra?.googleMapsWebApiKey
    || "").trim();
  const userMapCenter = useMemo(() => ({
    lat: userPosition.latitude,
    lng: userPosition.longitude
  }), [userPosition.latitude, userPosition.longitude]);
  const locationName = config.locationMode === "live" && locationPermission === "granted"
    ? "瀏覽器即時位置"
    : config.fixedLocation.name;

  useEffect(() => {
    const fallbackPosition = {
      latitude: config.fixedLocation.latitude,
      longitude: config.fixedLocation.longitude
    };
    let watchId = null;

    const reportApplied = (permission) => {
      if (!devControlEnabled || !selectedAuthUserId) return;
      const signature = `${selectedAuthUserId}:${config.version}:${permission}`;
      if (lastReportSignatureRef.current === signature) return;
      lastReportSignatureRef.current = signature;
      reportAppliedDevLocation({
        userId: selectedAuthUserId,
        config,
        locationPermission: permission
      }).catch(() => {});
    };

    setUserPosition(fallbackPosition);
    if (config.locationMode !== "live") {
      setLocationPermission("not_required");
      reportApplied("not_required");
      return undefined;
    }
    if (!navigator.geolocation) {
      setLocationPermission("unavailable");
      reportApplied("unavailable");
      return undefined;
    }

    setLocationPermission("requesting");
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationPermission("granted");
        reportApplied("granted");
      },
      (error) => {
        const permission = error.code === 1 ? "denied" : "error";
        setUserPosition(fallbackPosition);
        setLocationPermission(permission);
        reportApplied(permission);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [
    config.fixedLocation.latitude,
    config.fixedLocation.longitude,
    config.locationMode,
    config.version,
    devControlEnabled,
    selectedAuthUserId
  ]);

  useEffect(() => {
    if (!apiKey || !mapElementRef.current) {
      setMapReady(false);
      setMapError("尚未設定 Web Google Maps API key。");
      return undefined;
    }

    let active = true;
    setMapReady(false);
    setMapError("");

    loadGoogleMaps(apiKey)
      .then((googleMaps) => {
        if (!active || !mapElementRef.current) return;

        const map = new googleMaps.Map(mapElementRef.current, {
          center: userMapCenter,
          zoom: mapDefaults.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          scrollwheel: true,
          zoomControl: true,
          zoomControlOptions: {
            position: googleMaps.ControlPosition.RIGHT_CENTER
          }
        });

        googleMapsRef.current = googleMaps;
        mapInstanceRef.current = map;
        googleMaps.event.trigger(map, "resize");
        map.setCenter(userMapCenter);
        if (active) setMapReady(true);
      })
      .catch((error) => {
        console.error("Google Maps load failed:", error);
        if (active) {
          setMapReady(false);
          setMapError(`Google Maps 載入失敗：${error?.message ?? "請確認 Maps JavaScript API、Billing 與網站金鑰限制。"}`);
        }
      });

    return () => {
      active = false;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      markersByStoreIdRef.current.clear();
      mapInstanceRef.current = null;
      googleMapsRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    mapInstanceRef.current.panTo(userMapCenter);
  }, [mapReady, userMapCenter]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const googleMaps = googleMapsRef.current;
    if (!mapReady || !map || !googleMaps) return undefined;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersByStoreIdRef.current.clear();
    const nextMarkers = [];

    const userMarker = createStoreOverlayMarker({
      googleMaps,
      map,
      position: userMapCenter,
      title: locationName,
      color: "#2563eb",
      markerText: "我",
      labelText: locationName
    });
    nextMarkers.push(userMarker);

    visibleMapStores.forEach((store) => {
      const marker = createStoreOverlayMarker({
        googleMaps,
        map,
        position: { lat: store.latitude, lng: store.longitude },
        title: store.name,
        color: store.hasRecruitingGroupBuyActivity ? "#facc15" : "#2563eb",
        markerText: "店",
        labelText: getStoreMarkerLabel(store),
        onPress: () => focusStore(store)
      });
      markersByStoreIdRef.current.set(store.id, marker);
      nextMarkers.push(marker);
    });

    markersRef.current = nextMarkers;

    return () => {
      nextMarkers.forEach((marker) => marker.setMap(null));
      if (markersRef.current === nextMarkers) {
        markersRef.current = [];
        markersByStoreIdRef.current.clear();
      }
    };
  }, [locationName, mapReady, visibleMapStores, userMapCenter]);

  useEffect(() => {
    const mapElement = mapElementRef.current;
    const map = mapInstanceRef.current;
    const googleMaps = googleMapsRef.current;
    if (!mapReady || !mapElement || !map || !googleMaps) return undefined;

    const refreshMapSize = () => {
      googleMaps.event.trigger(map, "resize");
      map.setCenter(map.getCenter() || userMapCenter);
    };

    const frameId = window.requestAnimationFrame(refreshMapSize);
    const timeoutId = window.setTimeout(refreshMapSize, 250);
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(refreshMapSize)
      : null;

    resizeObserver?.observe(mapElement);
    window.addEventListener("resize", refreshMapSize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refreshMapSize);
    };
  }, [mapReady, userMapCenter]);

  const focusStore = (store) => {
    setSelectedStoreId(store.id);
    const nextPosition = { lat: store.latitude, lng: store.longitude };
    mapInstanceRef.current?.panTo(nextPosition);
    mapInstanceRef.current?.setZoom(Math.max(mapInstanceRef.current?.getZoom() ?? mapDefaults.zoom, 17));
  };

  const openSelectedStore = () => {
    if (!selectedStore) return;
    const destination = getStoreMapDestination(selectedStore);
    navigation.go(destination.name, destination.params);
  };

  return (
    <View style={styles.screen}>
      <div ref={mapElementRef} style={styles.map} />

      {!mapReady && !mapError ? (
        <View style={styles.loadingCard}>
          <Text style={styles.loadingText}>Google Maps 載入中...</Text>
        </View>
      ) : null}

      <View style={styles.overlay}>
        <Text style={styles.title}>即時地圖</Text>
        <Text style={styles.subtitle}>中心：{locationName}</Text>
        <Text style={styles.subtitle}>
          {devControlEnabled
            ? `控制台：${syncStatus === "ready" ? `${config.locationMode} · v${config.version}` : syncError || "同步中"}`
            : "開發定位控制未啟用"}
        </Text>
        <Text style={styles.subtitle}>{storeStatusText}</Text>
        <View style={styles.legendRow}>
          <LegendDot color="#2563eb" label="沒有可加入活動" />
          <LegendDot color="#facc15" label="有可加入活動" />
        </View>
        <View style={styles.filterRow} pointerEvents="auto">
          <DistanceRadiusFilter onChange={setRadiusKm} value={radiusKm} />
        </View>
      </View>

      {mapError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{mapError}</Text>
        </View>
      ) : null}

      {selectedStore ? (
        <View style={styles.storeCard}>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{selectedStore.name}</Text>
            <Text style={styles.storeMeta}>
              {selectedStore.address || "地址未提供"} · {selectedStore.hasRecruitingGroupBuyActivity ? `團購進行中 ${selectedStore.progressText}` : "目前沒有進行中的團購"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={openSelectedStore}
            style={styles.viewGroupBuyActivitiesButton}
          >
            <Text style={styles.viewGroupBuyActivitiesText}>
              {selectedStore.joinableGroupBuyActivityIds.length > 1
                ? "活動列表"
                : selectedStore.hasRecruitingGroupBuyActivity ? "查看活動" : "查看菜單"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function loadGoogleMaps(apiKey) {
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  if (window.__drinkGroupBuyGoogleMapsPromise) {
    return window.__drinkGroupBuyGoogleMapsPromise;
  }

  window.__drinkGroupBuyGoogleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = `drinkGroupBuyGoogleMapsLoaded_${Date.now()}`;
    const timeoutId = window.setTimeout(() => {
      delete window[callbackName];
      reject(new Error("Google Maps 載入逾時，請確認 Maps JavaScript API、Billing、API key 網域限制。"));
    }, 7000);

    window[callbackName] = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error("Google Maps script 已回應，但 window.google.maps 不存在。"));
      }
    };

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      callback: callbackName,
      v: "weekly"
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      reject(new Error("Google Maps script 載入失敗，可能是網路、API key 或網站限制問題。"));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    window.__drinkGroupBuyGoogleMapsPromise = null;
    throw error;
  });

  return window.__drinkGroupBuyGoogleMapsPromise;
}

function getStoreMarkerLabel(store) {
  return store.hasRecruitingGroupBuyActivity && store.progressText
    ? `${store.name} ${store.progressText}`
    : store.name;
}

function createStoreOverlayMarker({ googleMaps, map, position, title, color, markerText, labelText, onPress }) {
  class StoreOverlayMarker extends googleMaps.OverlayView {
    constructor() {
      super();
      this.position = new googleMaps.LatLng(position.lat, position.lng);
      this.title = title;
      this.color = color;
      this.markerText = markerText;
      this.labelText = labelText;
      this.onPress = onPress;
      this.element = null;
      this.markerElement = null;
      this.markerTextElement = null;
      this.labelElement = null;
    }

    onAdd() {
      const element = document.createElement("button");
      element.type = "button";
      element.title = this.title;
      element.style.position = "absolute";
      element.style.transform = "translate(-50%, -50%)";
      element.style.border = "0";
      element.style.background = "transparent";
      element.style.padding = "0";
      element.style.cursor = this.onPress ? "pointer" : "default";
      element.style.display = "flex";
      element.style.flexDirection = "column";
      element.style.alignItems = "center";
      element.style.gap = "3px";
      element.style.pointerEvents = "auto";
      element.style.willChange = "transform";

      const marker = document.createElement("div");
      marker.style.width = "30px";
      marker.style.height = "30px";
      marker.style.borderRadius = "999px";
      marker.style.border = "3px solid #ffffff";
      marker.style.display = "flex";
      marker.style.alignItems = "center";
      marker.style.justifyContent = "center";
      marker.style.fontSize = "11px";
      marker.style.fontWeight = "900";
      marker.style.boxShadow = "0 4px 10px rgba(15,23,42,0.28)";

      const markerTextNode = document.createElement("span");
      marker.appendChild(markerTextNode);

      const label = document.createElement("div");
      label.style.maxWidth = "148px";
      label.style.borderRadius = "7px";
      label.style.background = "rgba(255,255,255,0.96)";
      label.style.color = "#111827";
      label.style.fontSize = "10px";
      label.style.fontWeight = "900";
      label.style.lineHeight = "14px";
      label.style.padding = "2px 6px";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.boxShadow = "0 2px 8px rgba(15,23,42,0.18)";

      element.append(marker, label);
      if (this.onPress) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.onPress();
        });
      }

      this.element = element;
      this.markerElement = marker;
      this.markerTextElement = markerTextNode;
      this.labelElement = label;
      this.render();
      this.getPanes().overlayMouseTarget.appendChild(element);
    }

    draw() {
      if (!this.element) return;
      const point = this.getProjection().fromLatLngToDivPixel(this.position);
      if (!point) return;
      this.element.style.left = `${point.x}px`;
      this.element.style.top = `${point.y}px`;
    }

    onRemove() {
      this.element?.remove();
      this.element = null;
    }

    update(nextValues) {
      Object.assign(this, nextValues);
      this.render();
    }

    render() {
      if (!this.element || !this.markerElement || !this.markerTextElement || !this.labelElement) return;
      const isActive = this.color === "#facc15";
      this.element.title = this.title;
      this.markerElement.style.background = this.color;
      this.markerElement.style.color = isActive ? "#713f12" : "#ffffff";
      this.markerTextElement.textContent = this.markerText;
      this.labelElement.textContent = this.labelText;
    }
  }

  const marker = new StoreOverlayMarker();
  marker.setMap(map);
  return marker;
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#e2e8f0"
  },
  map: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#dbe4ef"
  },
  overlay: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    gap: 2,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    pointerEvents: "none"
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  subtitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  legendRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 5
  },
  filterRow: {
    marginTop: 6
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5
  },
  legendText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800"
  },
  errorCard: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 120,
    borderRadius: 14,
    backgroundColor: "#fee2e2",
    padding: 12
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800"
  },
  loadingCard: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 120,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 12
  },
  loadingText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  storeCard: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 12,
    boxShadow: "0 6px 18px rgba(15,23,42,0.24)"
  },
  storeInfo: {
    flex: 1,
    gap: 4
  },
  storeName: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  storeMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  viewGroupBuyActivitiesButton: {
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f6feb",
    paddingHorizontal: 14
  },
  viewGroupBuyActivitiesText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
