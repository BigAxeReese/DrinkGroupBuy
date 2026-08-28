import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { PrimaryButton } from "../components/PrimaryButton";

const screenContent = {
  discussion: {
    title: "討論區",
    section: "團購討論",
    placeholder: "討論列表",
    description: "之後可放活動留言、揪團討論與店家問答。",
    actionLabel: "回首頁",
    actionRoute: "nearby"
  }
};

export function CustomerPlaceholderScreen({ navigation, route, memberAction }) {
  const content = screenContent[route.params?.type] ?? screenContent.discussion;

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
