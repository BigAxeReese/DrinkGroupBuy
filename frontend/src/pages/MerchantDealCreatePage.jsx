import { useState } from "react";
import { stores } from "../mock/stores";
import { ScreenStateNotes } from "../components/ScreenStateNotes";

export function MerchantDealCreatePage() {
  const [form, setForm] = useState({
    storeId: stores[0].id,
    title: "",
    targetCups: 20,
    discountAmount: 400,
    startTime: "2026-05-28T13:00",
    endTime: "2026-05-28T16:00",
    pickupTime: "2026-05-28T17:30",
    notices: "",
  });
  const [created, setCreated] = useState(false);
  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  return (
    <section className="narrow-page">
      <div className="page-heading">
        <div><p className="eyebrow">?振?</p><h2>撱箇??芣?瘣餃?</h2></div>
      </div>
      <p className="warning-message">?桀?靘??ａ?瘙蝷箇??桐??舀?瑼鳴?撱箇?憭?頝????孵?隞?蝣箄???/p>
      <form className="panel form-stack" onSubmit={(event) => { event.preventDefault(); setCreated(true); }}>
        <label>?豢?摨振
          <select name="storeId" value={form.storeId} onChange={updateField}>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label>?芣??迂<input name="title" value={form.title} placeholder="靘? ???扒?頃" onChange={updateField} /></label>
        <div className="two-columns">
          <label>?格??舀<input name="targetCups" type="number" value={form.targetCups} onChange={updateField} /></label>
          <label>???<input name="discountAmount" type="number" value={form.discountAmount} onChange={updateField} /></label>
        </div>
        <label>????<input name="startTime" type="datetime-local" value={form.startTime} onChange={updateField} /></label>
        <label>蝯???<input name="endTime" type="datetime-local" value={form.endTime} onChange={updateField} /></label>
        <label>?疏??<input name="pickupTime" type="datetime-local" value={form.pickupTime} onChange={updateField} /></label>
        <label>瘜冽?鈭?<textarea name="notices" value={form.notices} placeholder="靘? ??啣??疏" onChange={updateField} /></label>
        <button className="primary-button" type="submit">撱箇?瘣餃?</button>
        {created && <p className="success-message">Mock嚗暑??蝔踹歇撱箇?嚗????隡箸??具?/p>}
      </form>
      <ScreenStateNotes loading="瘣餃?撱箇?銝?.." empty="撠憛怠神瘣餃??批捆?? error="蝯?????????嚗?鞎冽?????芣迫?? />
    </section>
  );
}
