import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { stores } from "../mock/stores";

export function MerchantDealCreateScreen({ navigation, actions, memberAction }) {
  const [storeId, setStoreId] = useState(stores[0].id);
  const [title, setTitle] = useState("離峰優惠團購");
  const [targetCups, setTargetCups] = useState("20");
  const [discountAmount, setDiscountAmount] = useState("400");
  const [maximumCups, setMaximumCups] = useState("50");
  const [endTime, setEndTime] = useState("今日 15:30");
  const [pickupTime, setPickupTime] = useState("今日 16:30 - 17:00");
  const [notices, setNotices] = useState("截止前可修改或退出");
  const [created, setCreated] = useState(false);

  return (
    <MobileScreen
      title="建立活動"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="選擇門市">
        {stores.map((store) => (
          <Pressable
            accessibilityRole="button"
            key={store.id}
            onPress={() => setStoreId(store.id)}
            style={[styles.option, storeId === store.id && styles.activeOption]}
          >
            <Text style={[styles.optionText, storeId === store.id && styles.activeOptionText]}>{store.name}</Text>
          </Pressable>
        ))}
      </Section>

      <Section title="活動設定">
        <MobileInput label="優惠名稱" value={title} onChangeText={setTitle} />
        <MobileInput label="目標杯數" value={targetCups} onChangeText={setTargetCups} keyboardType="number-pad" />
        <MobileInput label="折扣金額" value={discountAmount} onChangeText={setDiscountAmount} keyboardType="number-pad" />
        <MobileInput label="最高杯數上限" value={maximumCups} onChangeText={setMaximumCups} keyboardType="number-pad" />
        <MobileInput label="開始時間" value="今日 14:00" editable={false} />
        <MobileInput label="結束時間" value={endTime} onChangeText={setEndTime} />
        <MobileInput label="取貨時間" value={pickupTime} onChangeText={setPickupTime} />
        <MobileInput label="注意事項" value={notices} onChangeText={setNotices} />
      </Section>

      <PrimaryButton
        label="建立活動"
        onPress={() => {
          const dealId = actions.createMerchantDeal({ storeId, title, targetCups, discountAmount, maximumCups, endTime, pickupTime, notices });
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
  option: {
    minHeight: 50,
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14
  },
  activeOption: {
    borderColor: "#1f6feb",
    backgroundColor: "#dbeafe"
  },
  optionText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800"
  },
  activeOptionText: {
    color: "#1f6feb"
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
