import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import {
  createMerchantMenuItem,
  getMerchantStoreMenu,
  updateMerchantMenuItem
} from "../utils/apiClient";
import { formatCurrency } from "../utils/calculations";
import { colors, tones } from "../theme/tokens";

let nextLocalRowId = 1;
function createLocalRowId() {
  nextLocalRowId += 1;
  return `row-${nextLocalRowId}`;
}

const defaultOptionRows = {
  sweetness: [
    { label: "正常糖", priceDeltaText: "0" },
    { label: "半糖", priceDeltaText: "0" },
    { label: "微糖", priceDeltaText: "0" },
    { label: "無糖", priceDeltaText: "0" }
  ],
  ice: [
    { label: "正常冰", priceDeltaText: "0" },
    { label: "少冰", priceDeltaText: "0" },
    { label: "微冰", priceDeltaText: "0" },
    { label: "去冰", priceDeltaText: "0" }
  ],
  size: [
    { label: "中杯", priceDeltaText: "0" },
    { label: "大杯", priceDeltaText: "10" }
  ],
  topping: [
    { label: "珍珠", priceDeltaText: "10" },
    { label: "椰果", priceDeltaText: "10" }
  ]
};

const OPTION_TYPE_LABELS = {
  size: "尺寸選項",
  sweetness: "甜度選項",
  ice: "冰量選項",
  topping: "加料選項"
};

export function MerchantMenuManagementScreen({ navigation, memberAction, selectedMerchantStoreId }) {
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listNotice, setListNotice] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(() => createEmptyForm());
  const [formVisible, setFormVisible] = useState(false);
  const [formNotice, setFormNotice] = useState(null);

  async function loadMenu() {
    setLoading(true);
    setListNotice(null);
    try {
      setMenu(await getMerchantStoreMenu(selectedMerchantStoreId));
    } catch (error) {
      setListNotice({ type: "error", text: error.message || "菜單載入失敗。" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMenu();
  }, [selectedMerchantStoreId]);

  const title = editingItem ? `編輯：${editingItem.name}` : "新增飲品";
  const availableToppingCount = useMemo(
    () => form.optionLists.topping.filter((row) => row.label.trim()).length,
    [form.optionLists.topping]
  );
  const existingCategories = useMemo(
    () => [...new Set((menu?.menuItems || []).map((item) => item.category).filter(Boolean))],
    [menu?.menuItems]
  );

  function beginCreate() {
    setEditingItem(null);
    setForm(createEmptyForm());
    setFormNotice(null);
    setFormVisible(true);
  }

  function beginEdit(item) {
    setEditingItem(item);
    setForm(formFromMenuItem(item));
    setFormNotice(null);
    setFormVisible(true);
  }

  function closeForm() {
    setFormVisible(false);
    setFormNotice(null);
  }

  function addOptionRow(optionType) {
    setForm((current) => ({
      ...current,
      optionLists: {
        ...current.optionLists,
        [optionType]: [
          ...current.optionLists[optionType],
          { localId: createLocalRowId(), id: undefined, label: "", priceDeltaText: "0" }
        ]
      }
    }));
  }

  function removeOptionRow(optionType, localId) {
    setForm((current) => ({
      ...current,
      optionLists: {
        ...current.optionLists,
        [optionType]: current.optionLists[optionType].filter((row) => row.localId !== localId)
      }
    }));
  }

  function updateOptionRow(optionType, localId, field, value) {
    setForm((current) => ({
      ...current,
      optionLists: {
        ...current.optionLists,
        [optionType]: current.optionLists[optionType].map((row) => (
          row.localId === localId ? { ...row, [field]: value } : row
        ))
      }
    }));
  }

  async function saveItem() {
    const basePrice = Number(form.basePrice);
    const toppingMaxSelections = Number(form.toppingMaxSelections);
    if (!form.name.trim() || !form.category.trim()) {
      setFormNotice({ type: "error", text: "請填寫品名與分類。" });
      return;
    }
    if (!Number.isInteger(basePrice) || basePrice < 0) {
      setFormNotice({ type: "error", text: "基本價格必須是大於或等於 0 的整數。" });
      return;
    }
    if (!Number.isInteger(toppingMaxSelections) || toppingMaxSelections < 0) {
      setFormNotice({ type: "error", text: "加料上限必須是大於或等於 0 的整數。" });
      return;
    }
    if (toppingMaxSelections > availableToppingCount) {
      setFormNotice({ type: "error", text: `目前只有 ${availableToppingCount} 個加料選項，上限不可更高。` });
      return;
    }

    const customizationGroups = ["size", "sweetness", "ice", "topping"].map((optionType) => {
      const options = form.optionLists[optionType]
        .filter((row) => row.label.trim())
        .map((row) => ({
          id: row.id,
          label: row.label.trim(),
          // priceDeltaText only ever contains digits typed via a number-pad input (see
          // digitsOnly()), so this can never be NaN -- no silent fallback to 0 needed here.
          priceDelta: row.priceDeltaText === "" ? 0 : Number(row.priceDeltaText),
          isAvailable: true
        }));
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

    setFormNotice({ type: "busy", text: "儲存中…" });
    try {
      if (editingItem) {
        await updateMerchantMenuItem(selectedMerchantStoreId, editingItem.id, payload);
      } else {
        await createMerchantMenuItem(selectedMerchantStoreId, payload);
      }
      await loadMenu();
      setEditingItem(null);
      setForm(createEmptyForm());
      setFormVisible(false);
      setListNotice({ type: "success", text: "菜單已更新。" });
    } catch (error) {
      setFormNotice({ type: "error", text: error.message || "菜單儲存失敗。" });
    }
  }

  return (
    <>
    <MobileScreen
      title="菜單管理"
      subtitle={menu?.store?.name || selectedMerchantStoreId}
      onBack={() => navigation.goBack()}
      onMemberPress={memberAction}
      headerRight={(
        <Pressable
          accessibilityRole="button"
          onPress={beginCreate}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addButtonText}>＋ 新增飲品</Text>
        </Pressable>
      )}
    >
      <Section title="飲品清單">
        {loading ? <Text style={styles.meta}>載入中…</Text> : null}
        {listNotice ? (
          <Text style={listNotice.type === "error" ? styles.error : styles.success}>{listNotice.text}</Text>
        ) : null}
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
      </Section>
    </MobileScreen>

      <MenuItemFormModal
        visible={formVisible}
        title={title}
        onClose={closeForm}
      >
        <Field label="品名" value={form.name} onChangeText={(value) => setFormField(setForm, "name", value)} />
        <Field
          label="分類名稱（會直接顯示給顧客看，請填中文，例如：奶茶類、茶類、果汁類；同一家店建議固定用同幾種）"
          value={form.category}
          onChangeText={(value) => setFormField(setForm, "category", value)}
        />
        {existingCategories.length > 0 ? (
          <View style={styles.categoryChipRow}>
            {existingCategories.map((category) => (
              <Pressable
                key={category}
                accessibilityRole="button"
                onPress={() => setFormField(setForm, "category", category)}
                style={[styles.categoryChip, form.category === category && styles.categoryChipActive]}
              >
                <Text style={[styles.categoryChipText, form.category === category && styles.categoryChipTextActive]}>
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Field label="說明" value={form.description} onChangeText={(value) => setFormField(setForm, "description", value)} multiline />
        <Field label="基本價格" value={form.basePrice} onChangeText={(value) => setFormField(setForm, "basePrice", digitsOnly(value))} keyboardType="number-pad" />
        <OptionRowsField optionType="size" rows={form.optionLists.size} onAdd={addOptionRow} onRemove={removeOptionRow} onUpdate={updateOptionRow} />
        <OptionRowsField optionType="sweetness" rows={form.optionLists.sweetness} onAdd={addOptionRow} onRemove={removeOptionRow} onUpdate={updateOptionRow} />
        <OptionRowsField optionType="ice" rows={form.optionLists.ice} onAdd={addOptionRow} onRemove={removeOptionRow} onUpdate={updateOptionRow} />
        <OptionRowsField optionType="topping" rows={form.optionLists.topping} onAdd={addOptionRow} onRemove={removeOptionRow} onUpdate={updateOptionRow} />
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
        {formNotice ? (
          <Text style={formNotice.type === "error" ? styles.error : formNotice.type === "success" ? styles.success : styles.meta}>
            {formNotice.text}
          </Text>
        ) : null}
      </MenuItemFormModal>
    </>
  );
}

function MenuItemFormModal({ visible, title, onClose, children }) {
  if (!visible) return null;

  const content = (
    <View style={styles.modalOverlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="關閉"
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
      />
      <View style={styles.modalSheet}>
        <View style={styles.modalHeaderRow}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="關閉" onPress={onClose} style={styles.modalCloseButton}>
            <Text style={styles.modalCloseIcon}>✕</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
          {children}
        </ScrollView>
      </View>
    </View>
  );

  // Same web-vs-native split as ActivityFilterPanel -- RN Modal on web portals to document.body,
  // escaping the phone-frame mockup's clipping, so the sheet would render full-viewport-width
  // instead of staying inside the mocked phone screen.
  if (Platform.OS === "web") {
    return <View style={StyleSheet.absoluteFillObject}>{content}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.textSecondary} style={[styles.input, props.multiline && styles.multiline]} />
    </View>
  );
}

function OptionRowsField({ optionType, rows, onAdd, onRemove, onUpdate }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{OPTION_TYPE_LABELS[optionType]}</Text>
      {rows.map((row) => (
        <View key={row.localId} style={styles.optionRow}>
          <TextInput
            value={row.label}
            onChangeText={(value) => onUpdate(optionType, row.localId, "label", value)}
            placeholder="名稱"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, styles.optionRowLabelInput]}
          />
          <TextInput
            value={row.priceDeltaText}
            onChangeText={(value) => onUpdate(optionType, row.localId, "priceDeltaText", digitsOnly(value))}
            placeholder="加價"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            style={[styles.input, styles.optionRowPriceInput]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`刪除${row.label || "此"}選項`}
            onPress={() => onRemove(optionType, row.localId)}
            style={styles.optionRowRemoveButton}
          >
            <Text style={styles.optionRowRemoveText}>刪除</Text>
          </Pressable>
        </View>
      ))}
      <PrimaryButton label="＋ 新增選項" variant="secondary" onPress={() => onAdd(optionType)} />
    </View>
  );
}

function createEmptyForm() {
  return {
    name: "",
    category: "茶類",
    description: "",
    basePrice: "0",
    isAvailable: true,
    toppingMaxSelections: "2",
    optionLists: buildOptionLists(defaultOptionRows)
  };
}

function formFromMenuItem(item) {
  const optionLists = {};
  for (const optionType of ["size", "sweetness", "ice", "topping"]) {
    const group = item.customizationGroups.find((candidate) => candidate.optionType === optionType);
    optionLists[optionType] = (group?.options || [])
      .filter((option) => option.isAvailable)
      .map((option) => ({
        localId: createLocalRowId(),
        id: option.id,
        label: option.label,
        priceDeltaText: String(option.priceDelta)
      }));
  }
  const toppingGroup = item.customizationGroups.find((group) => group.optionType === "topping");
  return {
    name: item.name,
    category: item.category,
    description: item.description || "",
    basePrice: String(item.basePrice),
    isAvailable: item.isAvailable,
    toppingMaxSelections: String(toppingGroup?.maxSelections ?? 0),
    optionLists
  };
}

function buildOptionLists(rowsByType) {
  const optionLists = {};
  for (const optionType of Object.keys(rowsByType)) {
    optionLists[optionType] = rowsByType[optionType].map((row) => ({
      localId: createLocalRowId(),
      id: undefined,
      label: row.label,
      priceDeltaText: row.priceDeltaText
    }));
  }
  return optionLists;
}

function setFormField(setForm, field, value) {
  setForm((current) => ({ ...current, [field]: value }));
}

function digitsOnly(value) {
  return String(value).replace(/[^0-9]/g, "");
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  addButton: {
    minHeight: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: colors.recess
  },
  addButtonText: {
    color: colors.accentInk,
    fontSize: 13,
    fontWeight: "900"
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: `${colors.text}73`
  },
  modalSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.page,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12
  },
  modalTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  modalCloseIcon: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "900"
  },
  modalScroll: {
    flexGrow: 0
  },
  modalScrollContent: {
    gap: 12,
    paddingBottom: 18
  },
  itemCard: { gap: 8, borderWidth: 1, borderColor: colors.lineRow, borderRadius: 12, padding: 11 },
  row: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
  flex: { flex: 1 },
  itemName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  meta: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  available: { color: tones.success.fg, fontSize: 12, fontWeight: "900" },
  unavailable: { color: tones.danger.fg, fontSize: 12, fontWeight: "900" },
  field: { gap: 5 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  categoryChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -2 },
  categoryChip: { minHeight: 32, paddingHorizontal: 12, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.lineInput, backgroundColor: colors.recess },
  categoryChipActive: { borderColor: colors.accent, backgroundColor: colors.recess },
  categoryChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  categoryChipTextActive: { color: colors.accentInk },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.lineInput, borderRadius: 10, backgroundColor: colors.page, color: colors.text, paddingHorizontal: 11, paddingVertical: 9 },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  optionRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  optionRowLabelInput: { flex: 2, minWidth: 0 },
  optionRowPriceInput: { flex: 1, minWidth: 0 },
  optionRowRemoveButton: { minHeight: 46, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: tones.danger.bg },
  optionRowRemoveText: { color: tones.danger.fg, fontSize: 12, fontWeight: "900" },
  toggle: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: tones.danger.bg },
  toggleActive: { backgroundColor: tones.success.bg },
  toggleText: { color: tones.danger.fg, fontWeight: "900" },
  toggleTextActive: { color: tones.success.fg },
  error: { color: tones.danger.fg, fontSize: 12, fontWeight: "800" },
  success: { color: tones.success.fg, fontSize: 12, fontWeight: "800" }
});
