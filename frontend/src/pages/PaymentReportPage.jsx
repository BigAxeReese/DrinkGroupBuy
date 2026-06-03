import { useState } from "react";
import { useParams } from "react-router-dom";
import { paymentReports } from "../mock/paymentReports";
import { ScreenStateNotes } from "../components/ScreenStateNotes";
import { StatusBadge } from "../components/StatusBadge";

export function PaymentReportPage() {
  const { orderId } = useParams();
  const payment = paymentReports.find((entry) => entry.orderId === orderId) || paymentReports[0];
  const [lastFiveDigits, setLastFiveDigits] = useState("");
  const [fileName, setFileName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="narrow-page">
      <div className="page-heading">
        <div><p className="eyebrow">隞狡? Mock</p><h2>隞狡鞈?</h2></div>
        <StatusBadge status={payment.status} type="payment" />
      </div>
      <p className="warning-message">?祇??葫閰行???甈曉??梁?ｇ??靘??? / 蝺??臭??孵????典?敺Ⅱ隤?銝???撖阡?瘚?/p>
      <article className="panel payment-summary">
        <p>????<strong>${payment.amountDue}</strong></p>
        <p>?嗆狡??strong>{payment.recipientName}</strong></p>
        <p>?銵誨蝣?strong>{payment.bankCode}</strong></p>
        <p>撣唾?<strong>{payment.accountNumberMasked}</strong></p>
        <div className="qr-placeholder">{payment.qrCodeLabel}</div>
      </article>
      <form className="panel form-stack" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <label>?舀狡?思?蝣?          <input value={lastFiveDigits} maxLength="5" placeholder="靘? 12345" onChange={(event) => setLastFiveDigits(event.target.value.replace(/\D/g, ""))} />
        </label>
        <label>隞狡?芸?銝 placeholder
          <input type="file" onChange={(event) => setFileName(event.target.files?.[0]?.name || "")} />
        </label>
        {fileName && <p className="subtle">撌脤?內??獢?{fileName}</p>}
        <button className="primary-button" type="submit">?隞狡?</button>
        {submitted && <p className="success-message">Mock嚗?甈曉??勗歇?嚗??摮?銝瑼???/p>}
      </form>
      <ScreenStateNotes loading="隞狡????乩葉..." empty="撠?脣隞狡?挾?? error="隞狡??芷嚗?蝣箄?頛詨?批捆?? />
    </section>
  );
}
