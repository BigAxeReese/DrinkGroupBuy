import { useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { ActivityFilterPanel } from "../components/ActivityFilterPanel";
import { useActivityMapFilters } from "../hooks/useActivityMapFilters";
import { useDevLocationConfig } from "../hooks/useDevLocationConfig";
import { mapCenter, mapDefaults } from "../mock/mapConfig";
import { reportAppliedDevLocation } from "../utils/devLocationControl";
import { buildStoreMapStores, getStoreMapDestination, getStoreMarkerLabel } from "../utils/groupBuyActivityStores";

export function LiveMapScreen({ navigation, appState, selectedAuthUserId }) {
  const mapRef = useRef(null);
  const lastReportSignatureRef = useRef("");
  const zoom = mapDefaults.zoom;
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [filteredOutStoreName, setFilteredOutStoreName] = useState(null);
  const [locationPermission, setLocationPermission] = useState("not_required");
  const [userPosition, setUserPosition] = useState({
    latitude: mapCenter.latitude,
    longitude: mapCenter.longitude
  });
  const { config, enabled: devControlEnabled } = useDevLocationConfig(selectedAuthUserId);
  // Dev builds keep using the console's config exactly as before; everywhere else, always try
  // for the real device position -- Android/iOS already show their own native "allow location"
  // prompt, so there's no need for an extra in-app explanation screen ahead of it. If the person
  // denies, the banner below (driven by locationPermission) is what nudges them to go turn it on.
  const effectiveLocationMode = devControlEnabled ? config.locationMode : "live";
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
  const hasRealLocation = effectiveLocationMode === "live" && locationPermission === "granted";
  const locationName = hasRealLocation ? "手機即時位置" : config.fixedLocation.name;

  useEffect(() => {
    if (selectedStoreId && !visibleStoreIds.has(selectedStoreId)) {
      setFilteredOutStoreName(mapStores.find((store) => store.id === selectedStoreId)?.name ?? null);
      setSelectedStoreId(null);
    }
  }, [visibleStoreIds, selectedStoreId, mapStores]);

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
      if (effectiveLocationMode !== "live") {
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
    config.version,
    devControlEnabled,
    effectiveLocationMode,
    selectedAuthUserId
  ]);

  const recenterOnUser = () => {
    mapRef.current?.animateCamera({ center: userPosition, zoom }, { duration: 350 });
  };

  useEffect(() => {
    recenterOnUser();
  }, [userPosition, zoom]);

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
          description={effectiveLocationMode === "live" ? "顧客即時 GPS；失敗時使用固定備援位置" : "控制台指定的顧客固定位置"}
          pinColor="#7c3aed"
        />
        {visibleMapStores.map((store) => {
          const hasRecruitingGroupBuyActivity = store.hasRecruitingGroupBuyActivity;
          return (
            <Marker
              key={store.id}
              coordinate={{ latitude: store.latitude, longitude: store.longitude }}
              title={getStoreMarkerLabel(store)}
              description={hasRecruitingGroupBuyActivity ? "有招募中的團購" : "目前沒有招募中團購"}
              onPress={() => {
                setFilteredOutStoreName(null);
                setSelectedStoreId(store.id);
              }}
              pinColor={hasRecruitingGroupBuyActivity ? "#facc15" : "#2563eb"}
            />
          );
        })}
      </MapView>

      <Pressable
        accessibilityRole="button"
        onPress={openFilterPanel}
        style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
      >
        <Text style={styles.filterButtonText}>篩選</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="回到目前位置"
        onPress={recenterOnUser}
        style={({ pressed }) => [styles.recenterButton, pressed && styles.recenterButtonPressed]}
      >
        <Text style={styles.recenterIcon}>⌖</Text>
      </Pressable>

      {!devControlEnabled && locationPermission === "denied" ? (
        <View style={styles.locationPermissionPromptCard}>
          <Text style={styles.locationPermissionPromptTitle}>請開啟定位權限</Text>
          <Text style={styles.locationPermissionPromptBody}>
            開啟定位後，地圖會顯示你目前的位置，才能使用距離篩選找到附近的店家。目前顯示的是預設位置。
          </Text>
          <View style={styles.locationPermissionPromptActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openSettings()}
              style={({ pressed }) => [styles.locationPermissionPromptPrimaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.locationPermissionPromptPrimaryText}>前往設定開啟</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!selectedStore && filteredOutStoreName ? (
        <View style={styles.storeCard}>
          <View style={styles.storeInfo}>
            <Text style={styles.storeMeta}>
              {filteredOutStoreName} 已不符合目前的篩選條件，卡片已自動關閉。
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilteredOutStoreName(null)}
            style={styles.viewGroupBuyActivitiesButton}
          >
            <Text style={styles.viewGroupBuyActivitiesText}>知道了</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedStore ? (
        <View style={styles.storeCard}>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{selectedStore.name}</Text>
            <Text style={styles.storeMeta} numberOfLines={2}>
              {selectedStore.address || "地址未提供"} · {selectedStore.hasRecruitingGroupBuyActivity ? `招募中的團購 ${selectedStore.progressText}` : "目前沒有招募中團購"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={openSelectedStore}
            style={styles.viewGroupBuyActivitiesButton}
          >
            <Text style={styles.viewGroupBuyActivitiesText}>
              {selectedStore.joinableGroupBuyActivities.length > 1
                ? "活動列表"
                : selectedStore.hasRecruitingGroupBuyActivity ? "查看活動" : "查看菜單"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ActivityFilterPanel
        visible={filterPanelVisible}
        filters={filters}
        onApply={applyFilters}
        onClose={closeFilterPanel}
        hasLocation={hasRealLocation}
        onOpenLocationSettings={!devControlEnabled ? () => Linking.openSettings() : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#e2e8f0"
  },
  filterButton: {
    position: "absolute",
    bottom: 44,
    right: 14,
    minHeight: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2f7",
    paddingHorizontal: 16,
    elevation: 5
  },
  filterButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.75
  },
  recenterButton: {
    position: "absolute",
    bottom: 100,
    right: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    elevation: 5
  },
  recenterButtonPressed: {
    opacity: 0.8
  },
  recenterIcon: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900"
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
  },
  locationPermissionPromptCard: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 14,
    elevation: 6
  },
  locationPermissionPromptTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  locationPermissionPromptBody: {
    color: "#475569",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600"
  },
  locationPermissionPromptActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2
  },
  locationPermissionPromptPrimaryButton: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f6feb",
    paddingHorizontal: 16
  },
  locationPermissionPromptPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  }
});
