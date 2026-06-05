import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { databaseMapStores } from "../mock/databaseMapStores";
import { mapCenter, mapDefaults } from "../mock/mapConfig";

export function LiveMapScreen({ navigation }) {
  const mapRef = useRef(null);
  const [zoom, setZoom] = useState(mapDefaults.zoom);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const selectedStore = databaseMapStores.find((store) => store.id === selectedStoreId);

  const changeZoom = (amount) => {
    const nextZoom = Math.min(mapDefaults.maximumZoom, Math.max(mapDefaults.minimumZoom, zoom + amount));
    setZoom(nextZoom);
    mapRef.current?.animateCamera({ center: mapCenter, zoom: nextZoom }, { duration: 250 });
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
          coordinate={mapCenter}
          title={mapCenter.name}
          description="即時地圖預設中心點"
          pinColor="#2563eb"
        />
        {databaseMapStores.map((store) => {
          const hasRecruitingDeal = store.hasRecruitingDeal;
          return (
            <Marker
              key={store.id}
              coordinate={{ latitude: store.latitude, longitude: store.longitude }}
              title={store.name}
              description={hasRecruitingDeal ? "有招募中的團購" : "測試店家"}
              onPress={() => setSelectedStoreId(store.id)}
            >
              <View style={styles.storeMarkerWrap}>
                <View
                  style={[
                    styles.storeMarker,
                    { backgroundColor: hasRecruitingDeal ? "#facc15" : "#2563eb" }
                  ]}
                >
                  <Text style={[styles.storeMarkerText, hasRecruitingDeal && styles.activeStoreMarkerText]}>店</Text>
                </View>
                <View style={styles.storeMarkerLabel}>
                  <Text numberOfLines={1} style={styles.storeMarkerLabelText}>{store.name}</Text>
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.topOverlay}>
        <Text style={styles.title}>即時地圖</Text>
        <Text style={styles.subtitle}>中心：{mapCenter.name}</Text>
        <View style={styles.legendRow}>
          <LegendDot color="#2563eb" label="測試店家" />
          <LegendDot color="#facc15" label="團購進行中" />
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
            <Text style={styles.storeMeta}>{selectedStore.distanceText} · 招募中的團購</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => selectedStore.recruitingDealId
              ? navigation.go("dealDetail", { dealId: selectedStore.recruitingDealId })
              : navigation.replace("nearby")}
            style={styles.viewDealsButton}
          >
            <Text style={styles.viewDealsText}>看團購</Text>
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
  viewDealsButton: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f6feb",
    paddingHorizontal: 14
  },
  viewDealsText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
