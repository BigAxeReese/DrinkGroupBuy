import { Link, useParams } from "react-router-dom";
import { deals } from "../mock/deals";
import { groupOrders } from "../mock/groupOrders";
import { orders } from "../mock/orders";
import { ProgressCard } from "../components/ProgressCard";
import { ScreenStateNotes } from "../components/ScreenStateNotes";
import { StatusBadge } from "../components/StatusBadge";

export function GroupProgressPage() {
  const { dealId } = useParams();
  const deal = deals.find((entry) => entry.id === dealId) || deals[0];
  const groupOrder = groupOrders.find((entry) => entry.dealId === deal.id);
  const myOrder = orders.find((entry) => entry.dealId === deal.id);
  const promotionGap = groupOrder?.cupsUntilNextTier ?? Math.max(deal.targetCups - deal.currentCups, 0);

  return (
    <section className="narrow-page">
      <div className="page-heading">
        <div><p className="eyebrow">????瘣餃?</p><h2>?頃?脣漲</h2></div>
        <StatusBadge status={deal.status} />
      </div>
      <ProgressCard currentCups={deal.currentCups} targetCups={deal.targetCups} participantCount={deal.participantCount} remainingTimeText={deal.remainingTimeText} />
      <article className="panel stat-grid">
        <p><span>?芣?撌株?</span><strong>{promotionGap === 0 ? "撌脤??瑼? : `?榆 ${promotionGap} ?畔}</strong></p>
        <p><span>?擃??/span><strong>{deal.maximumCups} ??/strong></p>
        <p><span>?桀????/span><strong>{deal.status === "recruiting" ? "?芣迫?摰? : "蝯?撌脩??}</strong></p>
      </article>
      <article className="panel">
        <h3>??閮??</h3>
        {myOrder ? (
          <>
            <p>{myOrder.itemName} x {myOrder.quantity} | {myOrder.sweetness}?myOrder.ice}</p>
            <p>??嚗myOrder.toppings.join("??) || "??} | 撠? ${myOrder.subtotal}</p>
            <p className="subtle">瘚??末嚗myOrder.fallbackPurchasePreference === "accept_original_price" ? "?亙??" : "銝頃鞎瑚?銝?甈?}</p>
          </>
        ) : <p className="subtle">雿??芸??交迨瘣餃???/p>}
      </article>
      <div className="button-row">
        <Link className="secondary-button" to="/orders/order-002/payment">隞狡鞈? Mock</Link>
        <Link className="secondary-button" to="/orders/order-002/pickup">?疏鞈?</Link>
      </div>
      <ScreenStateNotes loading="?脣漲?摰????乩葉..." empty="?桀? 0 ?荔?撠???? error="?芣?蝝?鞈?銝??湛??⊥?閰衣??? />
    </section>
  );
}
