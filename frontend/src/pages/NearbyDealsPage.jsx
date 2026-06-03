import { Link } from "react-router-dom";
import { deals } from "../mock/deals";
import { stores } from "../mock/stores";
import { StatusBadge } from "../components/StatusBadge";
import { ProgressCard } from "../components/ProgressCard";
import { ScreenStateNotes } from "../components/ScreenStateNotes";

export function NearbyDealsPage() {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">憿批恥擐?</p>
          <h2>???芣??頃</h2>
          <p className="subtle">雿蔭蝷箸?嚗??銝剖控?嚗?銵典?隞??撖?Google Maps ?亥岷??/p>
        </div>
        <button className="secondary-button" type="button">?” / ?啣? Mock</button>
      </div>
      <div className="card-grid">
        {deals.map((deal) => {
          const store = stores.find((entry) => entry.id === deal.storeId);
          return (
            <article className="deal-card" key={deal.id}>
              <div className="card-row">
                <h3>{store.name}</h3>
                <StatusBadge status={deal.status} />
              </div>
              <p>{deal.title}</p>
              <p className="subtle">{store.distanceText} | {store.businessStatus}</p>
              <p>?芣??瑼鳴?{deal.targetCups} ?舀? ${deal.tiers[0].discountAmount}</p>
              <ProgressCard currentCups={deal.currentCups} targetCups={deal.targetCups} remainingTimeText={deal.remainingTimeText} />
              <Link className="primary-button" to={`/deals/${deal.id}`}>?亦?閰單?</Link>
            </article>
          );
        })}
      </div>
      <ScreenStateNotes loading="??瘣餃?頛銝?.." empty="???桀?瘝??臬??交暑?? error="?⊥??? mock 摨振?”?? />
    </section>
  );
}
