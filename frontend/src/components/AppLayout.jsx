import { NavLink, Outlet } from "react-router-dom";

const customerLinks = [
  { to: "/", label: "附近優惠" },
  { to: "/deals/deal-001/progress", label: "團購進度" },
  { to: "/orders/order-002/payment", label: "付款資訊" },
  { to: "/orders/order-002/pickup", label: "取貨資訊" },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">FRONTEND PROTOTYPE</p>
          <h1>DrinkGroupBuy</h1>
        </div>
        <nav className="main-nav" aria-label="顧客頁面">
          {customerLinks.map((link) => <NavLink end={link.to === "/"} key={link.to} to={link.to}>{link.label}</NavLink>)}
        </nav>
        <nav className="main-nav merchant-nav" aria-label="商家頁面">
          <NavLink to="/merchant/deals">商家儀表板</NavLink>
          <NavLink to="/merchant/deals/new">建立活動</NavLink>
        </nav>
      </header>
      <div className="prototype-banner">Mock data only. 不串接 API、地圖、登入、通知或真實付款服務。</div>
      <main className="page-container"><Outlet /></main>
    </div>
  );
}
