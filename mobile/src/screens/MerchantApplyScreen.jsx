import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { useFirebaseGoogleLogin } from "../utils/firebaseAuth";
import { submitMerchantApplication } from "../utils/apiClient";

// Always uses real Firebase Google Sign-In (not gated by AUTH_DEV_MODE) -- the applicant's
// identity here is who gets promoted to a merchant account if an admin later approves this,
// so it can't be satisfied by the dev-only identity switcher.
export function MerchantApplyScreen({ navigation }) {
  const { signInWithGoogle } = useFirebaseGoogleLogin();
  const [firebaseIdToken, setFirebaseIdToken] = useState(null);
  const [verifiedEmail, setVerifiedEmail] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState(null);

  async function verifyIdentity() {
    setVerifying(true);
    setNotice(null);
    try {
      const result = await signInWithGoogle();
      setFirebaseIdToken(result.firebaseIdToken);
      setVerifiedEmail(result.firebaseUser.email);
    } catch (error) {
      if (error.code !== "cancelled") {
        setNotice({ type: "error", text: error.message || "Google 驗證失敗" });
      }
    } finally {
      setVerifying(false);
    }
  }

  async function submit() {
    if (!storeName.trim() || !address.trim() || !contactPhone.trim()) {
      setNotice({ type: "error", text: "店名、地址、聯絡電話都是必填。" });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      await submitMerchantApplication({
        idToken: firebaseIdToken,
        storeName: storeName.trim(),
        address: address.trim(),
        contactPhone: contactPhone.trim()
      });
      setSubmitted(true);
    } catch (error) {
      setNotice({ type: "error", text: getMerchantApplyErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <MobileScreen title="申請成為商家" onBack={() => navigation.replace("roleSelect")}>
        <Section title="申請已送出">
          <Text style={styles.successText}>申請已送出，審核結果會另行通知。</Text>
          <PrimaryButton label="回登入頁" onPress={() => navigation.replace("roleSelect")} />
        </Section>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen
      title="申請成為商家"
      subtitle="申請將由管理員審核，審核通過後才能用這個 Google 帳號登入商家後台。"
      onBack={() => navigation.back()}
    >
      {notice ? (
        <Text style={notice.type === "error" ? styles.errorText : styles.successText}>{notice.text}</Text>
      ) : null}

      {!firebaseIdToken ? (
        <Section title="第一步：驗證身份">
          <Text style={styles.helperText}>先用 Google 帳號驗證身份，這個帳號核准後就會是商家登入帳號。</Text>
          <PrimaryButton
            label={verifying ? "驗證中…" : "使用 Google 帳號驗證身份"}
            disabled={verifying}
            onPress={verifyIdentity}
          />
        </Section>
      ) : (
        <>
          <Section title="已驗證身份">
            <Text style={styles.helperText}>{verifiedEmail}</Text>
          </Section>
          <Section title="第二步：填寫店家資料">
            <Text style={styles.fieldLabel}>店名</Text>
            <TextInput
              accessibilityLabel="店名"
              onChangeText={setStoreName}
              placeholder="例如：青山手作茶 中科店"
              style={styles.input}
              value={storeName}
            />
            <Text style={styles.fieldLabel}>地址</Text>
            <TextInput
              accessibilityLabel="地址"
              onChangeText={setAddress}
              placeholder="完整店家地址"
              style={styles.input}
              value={address}
            />
            <Text style={styles.fieldLabel}>聯絡電話</Text>
            <TextInput
              accessibilityLabel="聯絡電話"
              keyboardType="phone-pad"
              onChangeText={setContactPhone}
              placeholder="例如：04-1234-5678"
              style={styles.input}
              value={contactPhone}
            />
            <PrimaryButton
              label={submitting ? "送出中…" : "送出申請"}
              disabled={submitting}
              onPress={submit}
            />
          </Section>
        </>
      )}
    </MobileScreen>
  );
}

function getMerchantApplyErrorMessage(error) {
  const errorCode = error?.payload?.error ?? error?.payload?.status;
  const messages = {
    application_already_pending: "這個 Google 帳號已經有一筆待審核的申請了。",
    "Invalid Firebase ID token": "身份驗證已過期，請重新驗證一次。"
  };
  return messages[errorCode] || error?.message || "申請送出失敗，請稍後再試。";
}

const styles = StyleSheet.create({
  helperText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8
  },
  successText: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 4
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4
  }
});
