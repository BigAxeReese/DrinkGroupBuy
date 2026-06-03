import { Link } from "react-router-dom";
import { deals } from "../mock/deals";
import { orders } from "../mock/orders";
import { stores } from "../mock/stores";
import { StatusBadge } from "../components/StatusBadge";
import { ScreenStateNotes } from "../components/ScreenStateNotes";

export function MerchantDealDashboardPage() {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">?振?</p>
          <h2>瘣餃???????/h2>
        </div>
        <Link className="primary-button" to="/merchant/deals/new">撱箇?瘣餃?</Link>
      </div>
      <div className="dashboard-list">
        {deals.map((deal) => {
          const store = stores.find((entry) => entry.id === deal.storeId);
          const relatedOrders = orders.filter((entry) => entry.dealId === deal.id);
          const paidOrders = relatedOrders.filter((entry) => entry.paymentStatus === "confirmed").length;
          const readyPickups = relatedOrders.filter((entry) => entry.pickupStatus === "ready").length;
          return (
            <article className="panel dashboard-row" key={deal.id}>
              <div>
                <h3>{deal.title}</h3>
                <p className="subtle">{store.name}</p>
              </div>
              <StatusBadge status={deal.status} />
              <p><span>?桀? / ?格?</span><strong>{deal.currentCups} / {deal.targetCups} ??/strong></p>
              <p><span>閮??/span><strong>{relatedOrders.length}</strong></p>
              <p><span>隞狡??</span><strong>{paidOrders} 撌脩Ⅱ隤?/ {relatedOrders.length} 蝑?/strong></p>
              <p><span>?疏??</span><strong>{readyPickups} 蝑?疏</strong></p>
            </article>
          );
        })}
      </div>
      <ScreenStateNotes loading="?振瘣餃?皜頛銝?.." empty="撠撱箇?隞颱?瘣餃??? error="?⊥????振瘣餃? mock 鞈??? />
    </section>
  );
}
