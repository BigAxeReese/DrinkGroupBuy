import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { NearbyDealsPage } from "../pages/NearbyDealsPage";
import { DealDetailPage } from "../pages/DealDetailPage";
import { DrinkSelectionPage } from "../pages/DrinkSelectionPage";
import { GroupProgressPage } from "../pages/GroupProgressPage";
import { PaymentReportPage } from "../pages/PaymentReportPage";
import { PickupInfoPage } from "../pages/PickupInfoPage";
import { MerchantDealCreatePage } from "../pages/MerchantDealCreatePage";
import { MerchantDealDashboardPage } from "../pages/MerchantDealDashboardPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<NearbyDealsPage />} />
          <Route path="/deals/:dealId" element={<DealDetailPage />} />
          <Route path="/deals/:dealId/drinks" element={<DrinkSelectionPage />} />
          <Route path="/deals/:dealId/progress" element={<GroupProgressPage />} />
          <Route path="/orders/:orderId/payment" element={<PaymentReportPage />} />
          <Route path="/orders/:orderId/pickup" element={<PickupInfoPage />} />
          <Route path="/merchant/deals" element={<MerchantDealDashboardPage />} />
          <Route path="/merchant/deals/new" element={<MerchantDealCreatePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
