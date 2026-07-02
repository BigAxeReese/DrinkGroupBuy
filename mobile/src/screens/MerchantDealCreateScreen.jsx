import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { stores } from "../mock/stores";
import { createGroupBuyActivity } from "../utils/apiClient";
import { createDeadlineIsoFromInput, getDefaultDeadlineInput } from "../utils/deadlineTime";

const NativeDateTimePicker = Platform.OS === "web"
  ? null
  : require("@react-native-community/datetimepicker").default;

export function MerchantDealCreateScreen({ navigation, actions, memberAction, selectedMerchantStoreId }) {
  const merchantStore = stores.find((store) => store.id === selectedMerchantStoreId) ?? stores[0];
  const [title, setTitle] = useState("離峰優惠團購");
  const [tiers, setTiers] = useState([
    { id: "tier-draft-1", cups: "20", discountAmount: "200" }
  ]);
  const [deadlineDate, setDeadlineDate] = useState(() => new Date(createDeadlineIsoFromInput(getDefaultDeadlineInput())));
  const [pickupTime, setPickupTime] = useState("今日 16:30 - 17:00");
  const [notices, setNotices] = useState("截止前可修改或退出");
  const [created, setCreated] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  async function handleCreateDeal() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitMessage("");

    const startTime = new Date().toISOString();
    const deadlineAt = deadlineDate.toISOString();
    let dealId;

    try {
      const activity = await createGroupBuyActivity({
        storeId: merchantStore.id,
        title,
        startAt: startTime,
        deadlineAt,
        pickupStartAt: pickupTime,
        pickupEndAt: pickupTime,
        tiers: tiers.map((tier) => ({
          targetCups: Number(tier.cups),
          discountAmount: Number(tier.discountAmount)
        })),
        notice: notices
      });
      dealId = actions.addMerchantDealFromApi(activity);
      setSubmitMessage("活動已建立，並寫入 backend SQLite。");
    } catch (error) {
      dealId = actions.createMerchantDeal({
        storeId: merchantStore.id,
        title,
        tiers,
        startTime,
        deadlineAt,
        endTime: formatDeadlineWithoutYear(new Date(deadlineAt)),
        pickupTime,
        notices
      });
      setSubmitMessage(`Backend 未連線，已用本機 prototype 建立：${error.message}`);
    } finally {
      setSubmitting(false);
    }

    setCreated(true);
    navigation.replace("merchantDashboard", { createdDealId: dealId });
  }

  return (
    <MobileScreen
      title="建立活動"
      onBack={() => navigation.replace("merchantDashboard")}
      onMemberPress={memberAction}
    >
      <Section title="活動資料">
        <MobileInput label="活動名稱" value={title} onChangeText={setTitle} />
        <DateTimeInput
          label="結束時間"
          value={deadlineDate}
          onChange={setDeadlineDate}
        />
        <Text style={styles.helperText}>開團即開始；系統會在結束時間自動鎖定訂單。</Text>
        <MobileInput label="取貨時間" value={pickupTime} onChangeText={setPickupTime} />
        <MobileInput label="備註" value={notices} onChangeText={setNotices} />
      </Section>

      <Section title="優惠規則">
        <Text style={styles.helperText}>可設定多個杯數級距，例如 20 杯折 200、30 杯折 450。</Text>
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
              滿 {tier.cups || "0"} 杯折 {tier.discountAmount || "0"} 元
            </Text>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={addTier}
          style={({ pressed }) => [styles.addTierButton, pressed && styles.pressed]}
        >
          <Text style={styles.addTierButtonText}>新增優惠級距</Text>
        </Pressable>
      </Section>

      <PrimaryButton
        label={submitting ? "建立中..." : "建立活動"}
        onPress={handleCreateDeal}
      />
      {created || submitMessage ? <Text style={styles.success}>{submitMessage || "活動已建立"}</Text> : null}
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

function DateTimeInput({ label, value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");

  const handleNativeChange = (event, selectedDate) => {
    if (event.type === "dismissed") {
      setShowPicker(false);
      setPickerMode("date");
      return;
    }

    if (!selectedDate) return;
    onChange(selectedDate);

    if (Platform.OS === "android" && pickerMode === "date") {
      setPickerMode("time");
      setShowPicker(true);
      return;
    }

    setShowPicker(false);
    setPickerMode("date");
  };

  if (Platform.OS === "web") {
    return (
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.webDateRow}>
          <select
            value={toMonthDayKey(value)}
            onChange={(event) => {
              const nextDate = parseMonthDayKey(event.target.value, value);
              if (nextDate) onChange(nextDate);
            }}
            style={styles.webDateSelect}
          >
            {buildDateOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={toWebTimeValue(value)}
            onChange={(event) => {
              const nextDate = parseWebTimeValue(event.target.value, value);
              if (nextDate) onChange(nextDate);
            }}
            style={styles.webTimeInput}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setPickerMode("date");
          setShowPicker(true);
        }}
        style={({ pressed }) => [styles.datePickerButton, pressed && styles.pressed]}
      >
        <Text style={styles.datePickerText}>{formatDeadlineWithoutYear(value)}</Text>
        <Text style={styles.datePickerHint}>選擇日期時間</Text>
      </Pressable>
      {showPicker && NativeDateTimePicker ? (
        <NativeDateTimePicker
          value={value}
          mode={pickerMode}
          display="default"
          minimumDate={new Date()}
          onChange={handleNativeChange}
        />
      ) : null}
    </View>
  );
}

function buildDateOptions(days = 31) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      value: toMonthDayKey(date),
      label: formatMonthDayLabel(date)
    };
  });
}

function toMonthDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

function parseMonthDayKey(value, currentDate) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  const nextDate = new Date(currentDate);
  nextDate.setFullYear(year, month - 1, day);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

function toWebTimeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseWebTimeValue(value, currentDate) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const nextDate = new Date(currentDate);
  nextDate.setHours(hours, minutes, 0, 0);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

function formatDeadlineWithoutYear(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const hours24 = date.getHours();
  const meridiem = hours24 >= 12 ? "下午" : "上午";
  const hours12 = hours24 % 12 || 12;
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${meridiem} ${pad(hours12)}:${pad(date.getMinutes())}`;
}

function formatMonthDayLabel(date) {
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}（${weekday}）`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

const styles = StyleSheet.create({
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
  datePickerButton: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  datePickerText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700"
  },
  datePickerHint: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  webDateRow: {
    flexDirection: "row",
    gap: 10
  },
  webDateSelect: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 16,
    paddingLeft: 14,
    paddingRight: 14
  },
  webTimeInput: {
    width: 132,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 16,
    paddingLeft: 14,
    paddingRight: 14
  },
  success: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center"
  }
});
