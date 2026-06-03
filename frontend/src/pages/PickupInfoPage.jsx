import { useParams } from "react-router-dom";
import { pickupInfo } from "../mock/pickupInfo";
import { ScreenStateNotes } from "../components/ScreenStateNotes";
import { StatusBadge } from "../components/StatusBadge";

export function PickupInfoPage() {
  const { orderId } = useParams();
  const pickup = pickupInfo.find((entry) => entry.orderId === orderId) || pickupInfo[0];

  return (
    <section className="narrow-page">
      <div className="page-heading">
        <div><p className="eyebrow">?啣???疏</p><h2>?疏鞈?</h2></div>
        <StatusBadge status={pickup.status} type="pickup" />
      </div>
      <article className="panel details-list">
        <p><span>摨振</span>{pickup.storeName}</p>
        <p><span>?啣?</span>{pickup.address}</p>
        <p><span>?疏??</span>{pickup.pickupTime}</p>
        <p><span>閮??</span>{pickup.itemSummary}</p>
      </article>
      <article className="panel">
        <h3>?啣??內</h3>
        <p>{pickup.updateNotice}</p>
      </article>
      <ScreenStateNotes loading="?疏鞈?頛銝?.." empty="閮撠??嚗???鞎刻?閮? error="瘣餃?????鞎冽?畾萄歇??? />
    </section>
  );
}
