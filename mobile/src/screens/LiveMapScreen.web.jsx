import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import Constants from "expo-constants";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { databaseMapStores } from "../mock/databaseMapStores";
import { mapCenter, mapDefaults } from "../mock/mapConfig";

export function LiveMapScreen({ navigation, appState }) {
  const mapElementRef = useRef(null);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [mapError, setMapError] = useState("");
  const mapStores = databaseMapStores.map((store) => {
    const runtimeDeal = appState?.deals?.find((deal) => deal.storeId === store.id && deal.status === "recruiting");
    const progressText = runtimeDeal ? getDealProgressText(runtimeDeal) : "";
    return {
      ...store,
      hasRecruitingDeal: store.hasRecruitingDeal || Boolean(runtimeDeal),
      recruitingDealId: store.recruitingDealId || runtimeDeal?.id || null,
      progressText
    };
  });
  const selectedStore = mapStores.find((store) => store.id === selectedStoreId);
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    || Constants.expoConfig?.extra?.googleMapsWebApiKey
    || Constants.manifest2?.extra?.expoClient?.extra?.googleMapsWebApiKey;
  const webMapCenter = {
    lat: mapCenter.latitude,
    lng: mapCenter.longitude
  };

  useEffect(() => {
    if (!apiKey || !mapElementRef.current) {
      setMapError("尚未設定 Web Google Maps API key。");
      return undefined;
    }

    let active = true;
    const markers = [];
    setOptions({
      key: apiKey,
      version: "weekly"
    });

    importLibrary("maps")
      .then(({ Map }) => {
        if (!active || !mapElementRef.current) return;

        const map = new Map(mapElementRef.current, {
          center: webMapCenter,
          zoom: mapDefaults.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false
        });

        const campusMarker = new window.google.maps.Marker({
          map,
          position: webMapCenter,
          title: mapCenter.name,
          icon: createMarkerIcon("#2563eb", "校")
        });
        markers.push(campusMarker);

        mapStores.forEach((store) => {
          const marker = new window.google.maps.Marker({
            map,
            position: { lat: store.latitude, lng: store.longitude },
            title: store.name,
            icon: createMarkerIcon(store.hasRecruitingDeal ? "#facc15" : "#2563eb", "店"),
            label: {
              text: store.hasRecruitingDeal && store.progressText ? `${store.name} ${store.progressText}` : store.name,
              color: "#1f2937",
              fontSize: "10px",
              fontWeight: "700",
              className: "drink-group-buy-map-label"
            }
          });
          marker.addListener("click", () => setSelectedStoreId(store.id));
          markers.push(marker);
        });
      })
      .catch(() => {
        if (active) setMapError("Google Maps 載入失敗，請確認 Maps JavaScript API 與網站金鑰限制。");
      });

    return () => {
      active = false;
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [apiKey, appState?.deals]);

  return (
    <View style={styles.screen}>
      <div ref={mapElementRef} style={styles.map} />

      <View style={styles.overlay}>
        <Text style={styles.title}>即時地圖</Text>
        <Text style={styles.subtitle}>中心：{mapCenter.name}</Text>
        <View style={styles.legendRow}>
          <LegendDot color="#2563eb" label="測試店家" />
          <LegendDot color="#facc15" label="團購進行中" />
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
              {selectedStore.distanceText} · {selectedStore.hasRecruitingDeal ? `團購進行中 ${selectedStore.progressText}` : "目前沒有招募中團購"}
            </Text>
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

function getDealProgressText(deal) {
  const tierTargets = (deal.tiers ?? [])
    .map((tier) => Number(tier.cups))
    .filter((cups) => Number.isFinite(cups) && cups > 0)
    .sort((left, right) => left - right);
  const nextTarget = tierTargets.find((cups) => deal.currentCups < cups)
    ?? deal.targetCups
    ?? tierTargets[tierTargets.length - 1]
    ?? 0;
  return `${deal.currentCups}/${nextTarget}杯`;
}

function createMarkerIcon(color, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34">
      <circle cx="17" cy="17" r="14" fill="${color}" stroke="#ffffff" stroke-width="3"/>
      <text x="17" y="21" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${color === "#facc15" ? "#713f12" : "#ffffff"}">${label}</text>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(34, 34),
    anchor: new window.google.maps.Point(17, 17),
    labelOrigin: new window.google.maps.Point(17, 45)
  };
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
    width: "100%",
    height: "100%"
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
