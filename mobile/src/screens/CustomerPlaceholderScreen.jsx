import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { PrimaryButton } from "../components/PrimaryButton";

const screenContent = {
  liveMap: {
    title: "即時地圖",
    section: "附近店家地圖",
    placeholder: "地圖區域",
    description: "顯示附近店家與優惠活動。",
    actionLabel: "查看附近優惠",
    actionRoute: "nearby"
  },
  discussion: {
    title: "討論區",
    section: "團購討論",
    placeholder: "討論列表",
    description: "之後可放活動留言、揪團討論與店家問答。",
    actionLabel: "回首頁",
    actionRoute: "nearby"
  },
  profile: {
    title: "個人中心",
    section: "會員資料",
    placeholder: "會員卡片",
    description: "之後可放個人資料、信用評分、付款紀錄與取貨紀錄。",
    actionLabel: "切換登入身分",
    actionRoute: "roleSelect"
  }
};

export function CustomerPlaceholderScreen({ navigation, route, memberAction }) {
  const content = screenContent[route.params?.type] ?? screenContent.profile;

  return (
    <MobileScreen title={content.title} onMemberPress={memberAction}>
      <Section title={content.section}>
        <PlaceholderBox title={content.placeholder} />
        <Text style={styles.description}>{content.description}</Text>
        <PrimaryButton label={content.actionLabel} onPress={() => navigation.replace(content.actionRoute)} />
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  description: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22
  }
});
