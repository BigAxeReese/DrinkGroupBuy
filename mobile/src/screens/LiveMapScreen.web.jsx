import { useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityFilterPanel } from "../components/ActivityFilterPanel";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { useActivityMapFilters } from "../hooks/useActivityMapFilters";
import { useDevLocationConfig } from "../hooks/useDevLocationConfig";
import { mapCenter, mapDefaults } from "../mock/mapConfig";
import { colors, maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";
import { reportAppliedDevLocation } from "../utils/devLocationControl";
import { buildStoreMapStores, getStoreMapDestination, getStoreMarkerLabel } from "../utils/groupBuyActivityStores";

// The markers are raw DOM nodes and cannot read the StyleSheet, so their looks are spelled out here.
// Solid brown = the store has a group to join, white with a brown outline = it has none, dark = the
// customer's own position. Fill versus outline keeps the difference from depending on colour alone.
const MARKER_LOOKS = {
  user: { fill: colors.text, border: colors.page, ink: colors.onDark },
  recruiting: { fill: colors.accent, border: colors.page, ink: colors.onAccent },
  idle: { fill: colors.page, border: colors.accent, ink: colors.accentInk }
};
const MARKER_SIZE = spacing.s32 + spacing.s4;

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
  const { config, enabled: devControlEnabled } = useDevLocationConfig(selectedAuthUserId);

  const mapStores = useMemo(
    () => buildStoreMapStores(appState?.stores, appState?.groupBuyActivities),
    [appState?.stores, appState?.groupBuyActivities]
  );
  const {
    filters,
    visibleMapStores,
    visibleStoreIds,
    filterPanelVisible,
    openFilterPanel,
    closeFilterPanel,
    applyFilters
  } = useActivityMapFilters(mapStores, userPosition);

  const selectedStore = mapStores.find((store) => store.id === selectedStoreId);
  const apiKey = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    || Constants.expoConfig?.extra?.googleMapsWebApiKey
    || Constants.manifest2?.extra?.expoClient?.extra?.googleMapsWebApiKey
    || "").trim();
  const userMapCenter = useMemo(() => ({
    lat: userPosition.latitude,
    lng: userPosition.longitude
  }), [userPosition.latitude, userPosition.longitude]);
  const hasRealLocation = config.locationMode === "live" && locationPermission === "granted";
  const locationName = hasRealLocation ? "瀏覽器即時位置" : config.fixedLocation.name;

  useEffect(() => {
    if (selectedStoreId && !visibleStoreIds.has(selectedStoreId)) {
      setSelectedStoreId(null);
    }
  }, [visibleStoreIds, selectedStoreId]);

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
          panControl: false,
          rotateControl: false,
          scaleControl: false,
          cameraControl: false,
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

  const recenterOnUser = () => {
    mapInstanceRef.current?.panTo(userMapCenter);
  };

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    recenterOnUser();
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
      look: MARKER_LOOKS.user,
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
        look: store.hasRecruitingGroupBuyActivity ? MARKER_LOOKS.recruiting : MARKER_LOOKS.idle,
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
        <Card compact style={styles.mapStatus}>
          <Text style={styles.loadingText}>Google Maps 載入中...</Text>
        </Card>
      ) : null}

      {mapError ? (
        <View style={styles.mapStatus}>
          <Notice tone="danger" message={mapError} />
        </View>
      ) : null}

      {/* The controls and the store card share one bottom column, so a taller card pushes the
          controls up instead of covering them. box-none keeps the map draggable around them. */}
      <View style={styles.overlay}>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={openFilterPanel}
            style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
          >
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.filterButtonText}>篩選</Text>
          </Pressable>

          {mapReady ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="回到目前位置"
              onPress={recenterOnUser}
              style={({ pressed }) => [styles.recenterButton, pressed && styles.pressed]}
            >
              <RecenterIcon />
            </Pressable>
          ) : null}
        </View>

        {selectedStore ? (
          <Card compact style={styles.storeCard}>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{selectedStore.name}</Text>
              <Text style={styles.storeMeta} numberOfLines={2}>
                {selectedStore.address || "地址未提供"} · {selectedStore.hasRecruitingGroupBuyActivity ? `團購進行中 ${selectedStore.progressText}` : "目前沒有進行中的團購"}
              </Text>
            </View>
            <PrimaryButton
              label={selectedStore.joinableGroupBuyActivities.length > 1
                ? "活動列表"
                : selectedStore.hasRecruitingGroupBuyActivity ? "查看活動" : "查看菜單"}
              onPress={openSelectedStore}
            />
          </Card>
        ) : null}
      </View>

      <ActivityFilterPanel
        visible={filterPanelVisible}
        filters={filters}
        onApply={applyFilters}
        onClose={closeFilterPanel}
        hasLocation={hasRealLocation}
      />
    </View>
  );
}

// The "my location" crosshair, drawn with views instead of a font glyph.
function RecenterIcon() {
  return (
    <View style={styles.crosshair}>
      <View style={styles.crosshairRing} />
      <View style={styles.crosshairDot} />
      <View style={[styles.crosshairTick, styles.tickTop]} />
      <View style={[styles.crosshairTick, styles.tickBottom]} />
      <View style={[styles.crosshairTick, styles.tickLeft]} />
      <View style={[styles.crosshairTick, styles.tickRight]} />
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

function createStoreOverlayMarker({ googleMaps, map, position, title, look, markerText, labelText, onPress }) {
  class StoreOverlayMarker extends googleMaps.OverlayView {
    constructor() {
      super();
      this.position = new googleMaps.LatLng(position.lat, position.lng);
      this.title = title;
      this.look = look;
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
      element.style.gap = `${spacing.s4}px`;
      element.style.pointerEvents = "auto";
      element.style.willChange = "transform";

      const marker = document.createElement("div");
      marker.style.boxSizing = "border-box";
      marker.style.width = `${MARKER_SIZE}px`;
      marker.style.height = `${MARKER_SIZE}px`;
      marker.style.borderRadius = `${radii.pill}px`;
      marker.style.borderStyle = "solid";
      marker.style.borderWidth = `${sizes.stroke}px`;
      marker.style.display = "flex";
      marker.style.alignItems = "center";
      marker.style.justifyContent = "center";
      marker.style.fontSize = `${typeScale.label.fontSize}px`;
      marker.style.fontWeight = typeScale.label.fontWeight;

      const markerTextNode = document.createElement("span");
      marker.appendChild(markerTextNode);

      const label = document.createElement("div");
      label.style.maxWidth = "148px";
      label.style.borderRadius = `${radii.xs}px`;
      label.style.background = colors.page;
      label.style.color = colors.text;
      label.style.fontSize = `${typeScale.label.fontSize}px`;
      label.style.fontWeight = typeScale.label.fontWeight;
      label.style.lineHeight = `${typeScale.label.lineHeight}px`;
      label.style.padding = `${spacing.s4}px ${spacing.s8}px`;
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";

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
      this.element.title = this.title;
      this.markerElement.style.background = this.look.fill;
      this.markerElement.style.borderColor = this.look.border;
      this.markerElement.style.color = this.look.ink;
      this.markerTextElement.textContent = this.markerText;
      this.labelElement.textContent = this.labelText;
    }
  }

  const marker = new StoreOverlayMarker();
  marker.setMap(map);
  return marker;
}

const ICON_SIZE = spacing.s24;
const CROSSHAIR_RING = spacing.s16 - sizes.stroke;
const CROSSHAIR_TICK = spacing.s8 - sizes.stroke;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.recess
  },
  map: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.recess
  },
  // Where the loading / error card floats: a little below the top edge.
  mapStatus: {
    position: "absolute",
    left: spacing.s16,
    right: spacing.s16,
    top: spacing.s32 * 4
  },
  loadingText: {
    ...typeScale.bodyDense,
    color: colors.textSecondary
  },
  // The bottom offset keeps the map's attribution strip visible under the controls and the card.
  overlay: {
    position: "absolute",
    left: spacing.s16,
    right: spacing.s16,
    bottom: spacing.s32 + spacing.s12,
    gap: spacing.s12,
    pointerEvents: "box-none"
  },
  // column-reverse: the recenter button sits above the filter button while the source order (the
  // order screen readers walk) stays filter, recenter.
  controls: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
    flexDirection: "column-reverse",
    gap: spacing.s12,
    pointerEvents: "box-none"
  },
  filterButton: {
    minWidth: sizes.tap,
    minHeight: sizes.tap,
    borderRadius: radii.pill,
    borderWidth: sizes.stroke,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.page,
    paddingHorizontal: spacing.s16
  },
  filterButtonText: {
    ...typeScale.button,
    color: colors.accentInk
  },
  pressed: {
    opacity: 0.8
  },
  recenterButton: {
    minWidth: sizes.tap,
    minHeight: sizes.tap,
    borderRadius: radii.pill,
    borderWidth: sizes.stroke,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.page
  },
  crosshair: {
    width: ICON_SIZE,
    height: ICON_SIZE
  },
  crosshairRing: {
    position: "absolute",
    top: (ICON_SIZE - CROSSHAIR_RING) / 2,
    left: (ICON_SIZE - CROSSHAIR_RING) / 2,
    width: CROSSHAIR_RING,
    height: CROSSHAIR_RING,
    borderRadius: radii.pill,
    borderWidth: sizes.stroke,
    borderColor: colors.accent
  },
  crosshairDot: {
    position: "absolute",
    top: (ICON_SIZE - spacing.s4) / 2,
    left: (ICON_SIZE - spacing.s4) / 2,
    width: spacing.s4,
    height: spacing.s4,
    borderRadius: radii.pill,
    backgroundColor: colors.accent
  },
  crosshairTick: {
    position: "absolute",
    backgroundColor: colors.accent
  },
  tickTop: {
    top: 0,
    left: (ICON_SIZE - sizes.stroke) / 2,
    width: sizes.stroke,
    height: CROSSHAIR_TICK
  },
  tickBottom: {
    bottom: 0,
    left: (ICON_SIZE - sizes.stroke) / 2,
    width: sizes.stroke,
    height: CROSSHAIR_TICK
  },
  tickLeft: {
    left: 0,
    top: (ICON_SIZE - sizes.stroke) / 2,
    width: CROSSHAIR_TICK,
    height: sizes.stroke
  },
  tickRight: {
    right: 0,
    top: (ICON_SIZE - sizes.stroke) / 2,
    width: CROSSHAIR_TICK,
    height: sizes.stroke
  },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12
  },
  storeInfo: {
    flex: 1,
    gap: spacing.s4
  },
  storeName: {
    ...typeScale.button,
    color: colors.text
  },
  storeMeta: {
    ...typeScale.caption,
    color: colors.textSecondary
  }
});
