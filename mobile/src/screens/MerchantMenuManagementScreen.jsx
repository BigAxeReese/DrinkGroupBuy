import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import {
  createMerchantMenuItem,
  getMerchantStoreMenu,
  updateMerchantMenuItem
} from "../utils/apiClient";
import { formatCurrency } from "../utils/calculations";

const defaultOptionText = {
  sweetness: "正常糖:0, 半糖:0, 微糖:0, 無糖:0",
  ice: "正常冰:0, 少冰:0, 微冰:0, 去冰:0",
  size: "中杯:0, 大杯:10",
  topping: "珍珠:10, 椰果:10"
};

export function MerchantMenuManagementScreen({ navigation, memberAction, selectedMerchantStoreId }) {
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(() => createEmptyForm());

  async function loadMenu() {
    setLoading(true);
    setNotice(null);
    try {
      setMenu(await getMerchantStoreMenu(selectedMerchantStoreId));
    } catch (error) {
      setNotice({ type: "error", text: error.message || "菜單載入失敗。" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMenu();
  }, [selectedMerchantStoreId]);

  const title = editingItem ? `編輯：${editingItem.name}` : "新增飲品";
  const availableToppingCount = useMemo(
    () => parseOptionText(form.optionTexts.topping, []).length,
    [form.optionTexts.topping]
  );

  function beginCreate() {
    setEditingItem(null);
    setForm(createEmptyForm());
    setNotice(null);
  }

  function beginEdit(item) {
    setEditingItem(item);
    setForm(formFromMenuItem(item));
    setNotice(null);
  }

  async function saveItem() {
    const basePrice = Number(form.basePrice);
    const toppingMaxSelections = Number(form.toppingMaxSelections);
    if (!form.name.trim() || !form.category.trim()) {
      setNotice({ type: "error", text: "請填寫品名與分類。" });
      return;
    }
    if (!Number.isInteger(basePrice) || basePrice < 0) {
      setNotice({ type: "error", text: "基本價格必須是大於或等於 0 的整數。" });
      return;
    }
    if (!Number.isInteger(toppingMaxSelections) || toppingMaxSelections < 0) {
      setNotice({ type: "error", text: "加料上限必須是大於或等於 0 的整數。" });
      return;
    }
    if (toppingMaxSelections > availableToppingCount) {
      setNotice({ type: "error", text: `目前只有 ${availableToppingCount} 個加料選項，上限不可更高。` });
      return;
    }

    const customizationGroups = ["size", "sweetness", "ice", "topping"].map((optionType) => {
      const existingGroup = editingItem?.customizationGroups?.find((group) => group.optionType === optionType);
      const options = parseOptionText(form.optionTexts[optionType], existingGroup?.options || []);
      const singleChoice = optionType !== "topping";
      return {
        optionType,
        minSelections: singleChoice && options.length > 0 ? 1 : 0,
        maxSelections: singleChoice && options.length > 0 ? 1 : optionType === "topping" ? toppingMaxSelections : 0,
        options
      };
    });

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      basePrice,
      isAvailable: form.isAvailable,
      customizationGroups
    };

    setNotice({ type: "busy", text: "儲存中…" });
    try {
      if (editingItem) {
        await updateMerchantMenuItem(selectedMerchantStoreId, editingItem.id, payload);
      } else {
        await createMerchantMenuItem(selectedMerchantStoreId, payload);
      }
      await loadMenu();
      setEditingItem(null);
      setForm(createEmptyForm());
      setNotice({ type: "success", text: "菜單已更新。" });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "菜單儲存失敗。" });
    }
  }

  return (
    <MobileScreen
      title="菜單管理"
      subtitle={menu?.store?.name || selectedMerchantStoreId}
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="飲品清單">
        {loading ? <Text style={styles.meta}>載入中…</Text> : null}
        {!loading && menu?.menuItems?.length === 0 ? <Text style={styles.meta}>目前沒有飲品。</Text> : null}
        {(menu?.menuItems || []).map((item) => {
          const toppingRule = item.customizationGroups.find((group) => group.optionType === "topping");
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.meta}>{item.category} · {formatCurrency(item.basePrice)}</Text>
                  <Text style={styles.meta}>加料上限：{toppingRule?.maxSelections ?? 0}</Text>
                </View>
                <Text style={item.isAvailable ? styles.available : styles.unavailable}>
                  {item.isAvailable ? "上架" : "停售"}
                </Text>
              </View>
              <PrimaryButton label="編輯" variant="secondary" onPress={() => beginEdit(item)} />
            </View>
          );
        })}
        <PrimaryButton label="＋ 新增飲品" onPress={beginCreate} />
      </Section>

      <Section title={title}>
        <Field label="品名" value={form.name} onChangeText={(value) => setFormField(setForm, "name", value)} />
        <Field label="分類代碼" value={form.category} onChangeText={(value) => setFormField(setForm, "category", value)} />
        <Field label="說明" value={form.description} onChangeText={(value) => setFormField(setForm, "description", value)} multiline />
        <Field label="基本價格" value={form.basePrice} onChangeText={(value) => setFormField(setForm, "basePrice", digitsOnly(value))} keyboardType="number-pad" />
        <OptionTextField label="尺寸選項（名稱:加價）" optionType="size" form={form} setForm={setForm} />
        <OptionTextField label="甜度選項（名稱:加價）" optionType="sweetness" form={form} setForm={setForm} />
        <OptionTextField label="冰量選項（名稱:加價）" optionType="ice" form={form} setForm={setForm} />
        <OptionTextField label="加料選項（名稱:加價）" optionType="topping" form={form} setForm={setForm} />
        <Field
          label={`每杯加料上限（目前 ${availableToppingCount} 種）`}
          value={form.toppingMaxSelections}
          onChangeText={(value) => setFormField(setForm, "toppingMaxSelections", digitsOnly(value))}
          keyboardType="number-pad"
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setForm((current) => ({ ...current, isAvailable: !current.isAvailable }))}
          style={[styles.toggle, form.isAvailable && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, form.isAvailable && styles.toggleTextActive]}>
            {form.isAvailable ? "目前上架中" : "目前已停售"}
          </Text>
        </Pressable>
        <PrimaryButton label={editingItem ? "儲存修改" : "建立飲品"} onPress={saveItem} />
        {notice ? (
          <Text style={notice.type === "error" ? styles.error : notice.type === "success" ? styles.success : styles.meta}>
            {notice.text}
          </Text>
        ) : null}
      </Section>
    </MobileScreen>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} placeholderTextColor="#94a3b8" style={[styles.input, props.multiline && styles.multiline]} />
    </View>
  );
}

function OptionTextField({ label, optionType, form, setForm }) {
  return (
    <Field
      label={label}
      value={form.optionTexts[optionType]}
      onChangeText={(value) => setForm((current) => ({
        ...current,
        optionTexts: { ...current.optionTexts, [optionType]: value }
      }))}
      multiline
    />
  );
}

function createEmptyForm() {
  return {
    name: "",
    category: "tea",
    description: "",
    basePrice: "0",
    isAvailable: true,
    toppingMaxSelections: "2",
    optionTexts: { ...defaultOptionText }
  };
}

function formFromMenuItem(item) {
  const optionTexts = {};
  for (const optionType of ["size", "sweetness", "ice", "topping"]) {
    const group = item.customizationGroups.find((candidate) => candidate.optionType === optionType);
    optionTexts[optionType] = formatOptions(group?.options || []);
  }
  const toppingGroup = item.customizationGroups.find((group) => group.optionType === "topping");
  return {
    name: item.name,
    category: item.category,
    description: item.description || "",
    basePrice: String(item.basePrice),
    isAvailable: item.isAvailable,
    toppingMaxSelections: String(toppingGroup?.maxSelections ?? 0),
    optionTexts
  };
}

function formatOptions(options) {
  return options.filter((option) => option.isAvailable).map((option) => `${option.label}:${option.priceDelta}`).join(", ");
}

function parseOptionText(value, existingOptions) {
  return String(value || "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.lastIndexOf(":");
      const label = (separator >= 0 ? entry.slice(0, separator) : entry).trim();
      const parsedPrice = Number(separator >= 0 ? entry.slice(separator + 1).trim() : 0);
      const existing = existingOptions.find((option) => option.label === label);
      return {
        id: existing?.id,
        label,
        priceDelta: Number.isInteger(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0,
        isAvailable: true
      };
    });
}

function setFormField(setForm, field, value) {
  setForm((current) => ({ ...current, [field]: value }));
}

function digitsOnly(value) {
  return String(value).replace(/[^0-9]/g, "");
}

const styles = StyleSheet.create({
  itemCard: { gap: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 11 },
  row: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
  flex: { flex: 1 },
  itemName: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  meta: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  available: { color: "#047857", fontSize: 12, fontWeight: "900" },
  unavailable: { color: "#b91c1c", fontSize: 12, fontWeight: "900" },
  field: { gap: 5 },
  label: { color: "#334155", fontSize: 12, fontWeight: "800" },
  input: { minHeight: 46, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#fff", color: "#0f172a", paddingHorizontal: 11, paddingVertical: 9 },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  toggle: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#fee2e2" },
  toggleActive: { backgroundColor: "#dcfce7" },
  toggleText: { color: "#991b1b", fontWeight: "900" },
  toggleTextActive: { color: "#166534" },
  error: { color: "#b91c1c", fontSize: 12, fontWeight: "800" },
  success: { color: "#047857", fontSize: 12, fontWeight: "800" }
});
