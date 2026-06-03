import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { deals } from "../mock/deals";
import { drinks } from "../mock/drinks";
import { stores } from "../mock/stores";
import { ScreenStateNotes } from "../components/ScreenStateNotes";

export function DrinkSelectionPage() {
  const { dealId } = useParams();
  const deal = deals.find((entry) => entry.id === dealId) || deals[0];
  const store = stores.find((entry) => entry.id === deal.storeId);
  const availableDrinks = drinks.filter((entry) => entry.storeId === deal.storeId);
  const [drinkId, setDrinkId] = useState(availableDrinks[0]?.id || "");
  const [sweetness, setSweetness] = useState("敺桃?");
  const [ice, setIce] = useState("撠");
  const [toppingId, setToppingId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fallbackPreference, setFallbackPreference] = useState("decline_original_price");
  const [submitted, setSubmitted] = useState(false);
  const selectedDrink = availableDrinks.find((entry) => entry.id === drinkId);
  const selectedTopping = selectedDrink?.toppings.find((entry) => entry.id === toppingId);
  const subtotal = useMemo(() => ((selectedDrink?.price || 0) + (selectedTopping?.price || 0)) * quantity, [selectedDrink, selectedTopping, quantity]);

  return (
    <section className="narrow-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">?豢?憌脫?</p>
          <h2>{store.name}</h2>
        </div>
      </div>
      <form className="panel form-stack" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <label>憌脫???
          <select value={drinkId} onChange={(event) => { setDrinkId(event.target.value); setToppingId(""); }}>
            {availableDrinks.map((drink) => <option key={drink.id} value={drink.id}>{drink.name} - ${drink.price}</option>)}
          </select>
        </label>
        <div className="two-columns">
          <label>?漲
            <select value={sweetness} onChange={(event) => setSweetness(event.target.value)}>
              {selectedDrink?.sweetnessOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>?啣?
            <select value={ice} onChange={(event) => setIce(event.target.value)}>
              {selectedDrink?.iceOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <label>??
          <select value={toppingId} onChange={(event) => setToppingId(event.target.value)}>
            <option value="">銝???/option>
            {selectedDrink?.toppings.map((topping) => <option key={topping.id} value={topping.id}>{topping.name} +${topping.price}</option>)}
          </select>
        </label>
        <label>?賊?
          <input type="number" min="1" max="10" value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 1)} />
        </label>
        <fieldset>
          <legend>?交甇Ｘ??芷??芣??瑼?/legend>
          <label className="radio-row"><input type="radio" checked={fallbackPreference === "accept_original_price"} onChange={() => setFallbackPreference("accept_original_price")} />?亙??鞈潸眺</label>
          <label className="radio-row"><input type="radio" checked={fallbackPreference === "decline_original_price"} onChange={() => setFallbackPreference("decline_original_price")} />銝頃鞎瑚?銝?甈?/label>
        </fieldset>
        <div className="total-row"><span>撠?</span><strong>${subtotal}</strong></div>
        <button className="primary-button" type="submit">??頃</button>
        {submitted && <p className="success-message">Mock嚗歇??頃嚗??芸遣蝡??格?隞狡鞈???/p>}
      </form>
      <Link className="text-link" to={`/deals/${deal.id}`}>餈?瘣餃?閰單?</Link>
      <ScreenStateNotes loading="?頛銝?.." empty="摨振撠???舫憌脫??? error="瘣餃?撌脫甇Ｘ?撌脤??擃?賂??⊥???? />
    </section>
  );
}
