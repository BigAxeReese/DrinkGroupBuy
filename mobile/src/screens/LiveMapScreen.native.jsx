import { useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { DistanceRadiusFilter } from "../components/DistanceRadiusFilter";
import { useDevLocationConfig } from "../hooks/useDevLocationConfig";
import { mapCenter, mapDefaults } from "../mock/mapConfig";
import { calculateDistanceKm } from "../utils/distance";
import { reportAppliedDevLocation } from "../utils/devLocationControl";
import { buildStoreMapStores, getStoreMapDestination } from "../utils/groupBuyActivityStores";

export function LiveMapScreen({ navigation, appState, selectedAuthUserId }) {
  const mapRef = useRef(null);
  const lastReportSignatureRef = useRef("");
  const [zoom, setZoom] = useState(mapDefaults.zoom);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
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
  const selectedStore = visibleMapStores.find((store) => store.id === selectedStoreId);
  const storeSyncStatus = appState?.storeSyncStatus ?? "idle";
  const storeStatusText = storeSyncStatus === "error"
    ? "店家資料載入失敗"
    : storeSyncStatus === "loading" && mapStores.length === 0
      ? "店家資料載入中..."
      : `${visibleMapStores.length} 間店家`;
  const locationName = config.locationMode === "live" && locationPermission === "granted"
    ? "手機即時位置"
    : config.fixedLocation.name;

  useEffect(() => {
    let active = true;
    let locationSubscription = null;
    const fallbackPosition = {
      latitude: config.fixedLocation.latitude,
      longitude: config.fixedLocation.longitude
    };

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

    async function applyLocationConfig() {
      setUserPosition(fallbackPosition);
      if (config.locationMode !== "live") {
        setLocationPermission("not_required");
        reportApplied("not_required");
        return;
      }

      setLocationPermission("requesting");
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (permission.status !== "granted") {
          setLocationPermission("denied");
          reportApplied("denied");
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        setUserPosition({ latitude: currentPosition.coords.latitude, longitude: currentPosition.coords.longitude });
        setLocationPermission("granted");
        reportApplied("granted");

        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 3000 },
          (nextPosition) => {
            if (!active) return;
            setUserPosition({ latitude: nextPosition.coords.latitude, longitude: nextPosition.coords.longitude });
          }
        );
        if (!active) locationSubscription.remove();
      } catch {
        if (!active) return;
        setLocationPermission("error");
        reportApplied("error");
      }
    }

    applyLocationConfig();
    return () => {
      active = false;
      locationSubscription?.remove();
    };
  }, [
    config.fixedLocation.latitude,
    config.fixedLocation.longitude,
    config.locationMode,
    config.version,
    devControlEnabled,
    selectedAuthUserId
  ]);

  useEffect(() => {
    mapRef.current?.animateCamera({ center: userPosition, zoom }, { duration: 350 });
  }, [userPosition, zoom]);

  const changeZoom = (amount) => {
    const nextZoom = Math.min(mapDefaults.maximumZoom, Math.max(mapDefaults.minimumZoom, zoom + amount));
    setZoom(nextZoom);
    mapRef.current?.animateCamera({ center: userPosition, zoom: nextZoom }, { duration: 250 });
  };

  const openSelectedStore = () => {
    if (!selectedStore) return;
    const destination = getStoreMapDestination(selectedStore);
    navigation.go(destination.name, destination.params);
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialCamera={{
          center: mapCenter,
          pitch: 0,
          heading: 0,
          altitude: 0,
          zoom
        }}
        rotateEnabled={false}
        showsCompass={false}
        toolbarEnabled={false}
        mapType="standard"
        showsPointsOfInterest={false}
      >
        <Marker
          coordinate={userPosition}
          title={locationName}
          description={config.locationMode === "live" ? "顧客即時 GPS；失敗時使用固定備援位置" : "控制台指定的顧客固定位置"}
          pinColor="#2563eb"
        />
        {visibleMapStores.map((store) => {
          const hasRecruitingGroupBuyActivity = store.hasRecruitingGroupBuyActivity;
          return (
            <Marker
              key={store.id}
              coordinate={{ latitude: store.latitude, longitude: store.longitude }}
              title={store.name}
              description={hasRecruitingGroupBuyActivity ? "有招募中的團購" : "目前沒有招募中團購"}
              onPress={() => setSelectedStoreId(store.id)}
            >
              <View style={styles.storeMarkerWrap}>
                <View
                  style={[
                    styles.storeMarker,
                    { backgroundColor: hasRecruitingGroupBuyActivity ? "#facc15" : "#2563eb" }
                  ]}
                >
                  <Text style={[styles.storeMarkerText, hasRecruitingGroupBuyActivity && styles.activeStoreMarkerText]}>店</Text>
                </View>
                <View style={styles.storeMarkerLabel}>
                  <Text numberOfLines={1} style={styles.storeMarkerLabelText}>{store.name}</Text>
                  {hasRecruitingGroupBuyActivity && store.progressText ? (
                    <Text numberOfLines={1} style={styles.storeMarkerProgressText}>{store.progressText}</Text>
                  ) : null}
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.topOverlay}>
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
        <View style={styles.filterRow}>
          <DistanceRadiusFilter onChange={setRadiusKm} value={radiusKm} />
        </View>
      </View>

      <View style={styles.zoomControls}>
        <Pressable accessibilityRole="button" onPress={() => changeZoom(1)} style={styles.zoomButton}>
          <Text style={styles.zoomButtonText}>＋</Text>
        </Pressable>
        <Text style={styles.zoomLabel}>{zoom}</Text>
        <Pressable accessibilityRole="button" onPress={() => changeZoom(-1)} style={styles.zoomButton}>
          <Text style={styles.zoomButtonText}>－</Text>
        </Pressable>
      </View>

      {selectedStore ? (
        <View style={styles.storeCard}>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{selectedStore.name}</Text>
            <Text style={styles.storeMeta}>
              {selectedStore.address || "地址未提供"} · {selectedStore.hasRecruitingGroupBuyActivity ? `招募中的團購 ${selectedStore.progressText}` : "目前沒有招募中團購"}
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
  topOverlay: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 72,
    gap: 2,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    elevation: 5
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
  storeMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    elevation: 4
  },
  storeMarkerWrap: {
    width: 116,
    alignItems: "center"
  },
  storeMarkerText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  activeStoreMarkerText: {
    color: "#713f12"
  },
  storeMarkerLabel: {
    maxWidth: 116,
    marginTop: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    elevation: 3
  },
  storeMarkerLabelText: {
    color: "#1f2937",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center"
  },
  storeMarkerProgressText: {
    color: "#b45309",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center"
  },
  zoomControls: {
    position: "absolute",
    right: 14,
    top: 14,
    alignItems: "center",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    elevation: 5
  },
  zoomButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center"
  },
  zoomButtonText: {
    color: "#0f172a",
    fontSize: 25,
    fontWeight: "900"
  },
  zoomLabel: {
    width: 46,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0"
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
    elevation: 6
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
    minHeight: 42,
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
