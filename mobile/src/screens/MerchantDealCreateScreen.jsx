import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { stores } from "../mock/stores";

export function MerchantDealCreateScreen({ navigation, actions, memberAction }) {
  const merchantStore = stores[0];
  const [title, setTitle] = useState("離峰優惠團購");
  const [tiers, setTiers] = useState([
    { id: "tier-draft-1", cups: "20", discountAmount: "200" }
  ]);
  const [startTime, setStartTime] = useState("今日 14:00");
  const [endTime, setEndTime] = useState("今日 15:30");
  const [pickupTime, setPickupTime] = useState("今日 16:30 - 17:00");
  const [notices, setNotices] = useState("截止前可修改或退出");
  const [created, setCreated] = useState(false);

  const updateTier = (tierId, field, value) => {
    setTiers((items) => items.map((tier) => (
      tier.id === tierId ? { ...tier, [field]: value } : tier
    )));
  };

  const addTier = () => {
    const previousTier = tiers[tiers.length - 1];
    const nextCups = (Number(previousTier?.cups) || 20) + 10;
    const nextDiscount = (Number(previousTier?.discountAmount) || 200) + 100;
    setTiers((items) => [
      ...items,
      {
        id: `tier-draft-${Date.now()}`,
        cups: String(nextCups),
        discountAmount: String(nextDiscount)
      }
    ]);
  };

  const removeTier = (tierId) => {
    setTiers((items) => items.filter((tier) => tier.id !== tierId));
  };

  return (
    <MobileScreen
      title="建立活動"
      onBack={() => navigation.replace("merchantDashboard")}
      onMemberPress={memberAction}
    >
      <Section title="目前商家">
        <View style={styles.merchantStore}>
          <Text style={styles.merchantStoreName}>{merchantStore.name}</Text>
          <Text style={styles.merchantStoreNote}>測試階段固定使用此商家；未來將由登入帳號決定。</Text>
        </View>
      </Section>

      <Section title="活動資料">
        <MobileInput label="優惠名稱" value={title} onChangeText={setTitle} />
        <MobileInput label="取貨時間" value={pickupTime} onChangeText={setPickupTime} />
        <MobileInput label="注意事項" value={notices} onChangeText={setNotices} />
      </Section>

      <Section title="優惠規則">
        <Text style={styles.helperText}>可設定多個杯數門檻；達到越高級距，套用對應折扣。</Text>
        {tiers.map((tier, index) => (
          <View key={tier.id} style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={styles.tierTitle}>優惠級距 {index + 1}</Text>
              {tiers.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => removeTier(tier.id)}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                >
                  <Text style={styles.removeButtonText}>刪除</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.tierInputs}>
              <View style={styles.tierInput}>
                <MobileInput
                  label="杯數門檻"
                  value={tier.cups}
                  onChangeText={(value) => updateTier(tier.id, "cups", value)}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.tierInput}>
                <MobileInput
                  label="折扣金額"
                  value={tier.discountAmount}
                  onChangeText={(value) => updateTier(tier.id, "discountAmount", value)}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Text style={styles.tierSummary}>
              滿 {tier.cups || "0"} 杯，整團折扣 ${tier.discountAmount || "0"}
            </Text>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={addTier}
          style={({ pressed }) => [styles.addTierButton, pressed && styles.pressed]}
        >
          <Text style={styles.addTierButtonText}>＋ 增加優惠級距</Text>
        </Pressable>
      </Section>

      <Section title="活動時間">
        <MobileInput label="開始時間" value={startTime} onChangeText={setStartTime} />
        <MobileInput label="結束時間" value={endTime} onChangeText={setEndTime} />
      </Section>

      <PrimaryButton
        label="建立活動"
        onPress={() => {
          const dealId = actions.createMerchantDeal({
            storeId: merchantStore.id,
            title,
            tiers,
            startTime,
            endTime,
            pickupTime,
            notices
          });
          setCreated(true);
          navigation.replace("merchantDashboard", { createdDealId: dealId });
        }}
      />
      {created ? <Text style={styles.success}>活動已建立。</Text> : null}
    </MobileScreen>
  );
}

function MobileInput({ label, ...props }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#94a3b8" {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  merchantStore: {
    gap: 4,
    borderRadius: 13,
    backgroundColor: "#eaf2ff",
    padding: 11
  },
  merchantStoreName: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  merchantStoreNote: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17
  },
  helperText: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18
  },
  tierCard: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#f8fbff",
    padding: 12
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  tierTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  tierInputs: {
    flexDirection: "row",
    gap: 10
  },
  tierInput: {
    flex: 1
  },
  tierSummary: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800"
  },
  addTierButton: {
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#93c5fd",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff"
  },
  addTierButtonText: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "900"
  },
  removeButton: {
    minHeight: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 12
  },
  removeButtonText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.72
  },
  inputGroup: {
    gap: 6
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 16,
    paddingHorizontal: 14
  },
  success: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center"
  }
});
