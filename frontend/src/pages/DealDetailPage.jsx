import { Link, useParams } from "react-router-dom";
import { deals } from "../mock/deals";
import { stores } from "../mock/stores";
import { ProgressCard } from "../components/ProgressCard";
import { ScreenStateNotes } from "../components/ScreenStateNotes";
import { StatusBadge } from "../components/StatusBadge";

export function DealDetailPage() {
  const { dealId } = useParams();
  const deal = deals.find((entry) => entry.id === dealId) || deals[0];
  const store = stores.find((entry) => entry.id === deal.storeId);

  return (
    <section className="narrow-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">瘣餃?閰單?</p>
          <h2>{deal.title}</h2>
        </div>
        <StatusBadge status={deal.status} />
      </div>
      <article className="panel">
        <h3>{store.name}</h3>
        <p>{store.address}</p>
        <p className="subtle">{store.distanceText} | {store.businessStatus} | {store.phone}</p>
      </article>
      <ProgressCard currentCups={deal.currentCups} targetCups={deal.targetCups} participantCount={deal.participantCount} remainingTimeText={deal.remainingTimeText} />
      <article className="panel">
        <h3>?舀?芣?蝝?</h3>
        <ul className="tier-list">
          {deal.tiers.map((tier) => <li key={tier.cups}>皛?{tier.cups} ?荔??游???${tier.discountAmount}</li>)}
        </ul>
        <p className="subtle">?隞交?詨像????蝎曄Ⅱ?典閬?隞?蝣箄???/p>
      </article>
      <article className="panel">
        <h3>瘜冽?鈭?</h3>
        <p>?芣迫嚗deal.endTime} | ?疏嚗deal.pickupTime}</p>
        <ul>{deal.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>
        {deal.cancellationReason && <p className="error-text">????嚗deal.cancellationReason}</p>}
      </article>
      <div className="button-row">
        <Link className={deal.canJoin ? "primary-button" : "disabled-button"} to={deal.canJoin ? `/deals/${deal.id}/drinks` : "#"}>
          {deal.canJoin ? "?豢?憌脫?銝血??? : "?桀?銝?"}
        </Link>
        <Link className="secondary-button" to={`/deals/${deal.id}/progress`}>?亦??脣漲</Link>
      </div>
      <ScreenStateNotes loading="瘣餃?閰單?霈?葉..." empty="甇文?摰嗅??芣?靘??頝? error="瘣餃?撌脫甇Ｕ?皛踵??剖?瘨?銝??? />
    </section>
  );
}
