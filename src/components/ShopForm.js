import { useState } from 'react';
import { categories } from '../data/catalog';
import { couriers } from '../data/couriers';
import { DEFAULT_LOCATION } from '../data/zambia';
import LocationFields from './LocationFields';

const PHONE = /^(\+?260|0)?[79]\d{8}$/;

const empty = {
  ownerName: '',
  name: '',
  phone: '',
  category: '',
  ...DEFAULT_LOCATION,
  area: '',
  couriers: ['pickup', 'seller', 'yango', 'platinum'],
  ownRates: { town: 30, province: 90 },
};

// Shop details form used for registration and for editing settings later.
export default function ShopForm({ initial, onSubmit, submitLabel, withOwner = false }) {
  const [form, setForm] = useState({
    ...empty,
    ...initial,
    category: initial?.category ?? '',
    area: initial?.area ?? '',
    ownRates: initial?.ownRates ?? empty.ownRates,
    tpin: initial?.tpin ?? '',
    vatRegistered: initial?.vatRegistered ?? false,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleCourier = (id) =>
    setForm((f) => ({
      ...f,
      couriers: f.couriers.includes(id) ? f.couriers.filter((c) => c !== id) : [...f.couriers, id],
    }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (withOwner && !form.ownerName.trim()) errs.ownerName = 'Enter your name';
    if (!form.name.trim()) errs.name = 'Enter your shop name';
    if (!PHONE.test(form.phone.replace(/\s/g, ''))) errs.phone = 'Enter a valid Zambian number';
    if (!form.area.trim()) errs.area = 'Enter your street, market or area';
    if (form.tpin && !/^\d{10}$/.test(form.tpin.trim())) errs.tpin = 'A TPIN has 10 digits';
    if (!form.couriers.some((c) => c !== 'pickup')) errs.couriers = 'Choose at least one delivery option';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const { ownerName, ...shop } = form;
    const category = categories.find((c) => c.id === shop.category);
    setSaving(true);
    try {
      await onSubmit({ ...shop, logo: category?.icon ?? shop.logo ?? '🏪' }, { name: ownerName, phone: form.phone });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  const input = (key, label, props = {}) => (
    <div className="field">
      <label htmlFor={`shop-${key}`}>{label}</label>
      <input
        id={`shop-${key}`}
        value={form[key]}
        onChange={set(key)}
        className={errors[key] ? 'invalid' : ''}
        {...props}
      />
      {errors[key] && <span className="error">{errors[key]}</span>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <h3>Shop details</h3>
      <div className="form-grid">
        {withOwner && input('ownerName', 'Your name', { autoComplete: 'name' })}
        {input('name', 'Shop name', { placeholder: 'e.g. Mwansa General Dealers' })}
        {input('phone', 'Phone (WhatsApp)', { type: 'tel', placeholder: '097 123 4567' })}
        <div className="field">
          <label htmlFor="shop-category">Main category</label>
          <select id="shop-category" value={form.category} onChange={set('category')}>
            <option value="">Mixed / general</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3>Shop location</h3>
      <div className="form-grid">
        <LocationFields
          value={{ province: form.province, town: form.town }}
          onChange={(loc) => setForm((f) => ({ ...f, ...loc }))}
          idPrefix="shop"
        />
      </div>
      {input('area', 'Street, market or area', { placeholder: 'e.g. Shop 14, Kamwala Market' })}

      <h3>Tax details (optional)</h3>
      <p className="muted small">Shown on your customers' receipts.</p>
      <div className="form-grid">
        {input('tpin', 'TPIN', { inputMode: 'numeric', placeholder: '10 digits' })}
        <label className="check">
          <input
            type="checkbox"
            checked={form.vatRegistered}
            onChange={(e) => setForm((f) => ({ ...f, vatRegistered: e.target.checked }))}
          />
          Registered for VAT (prices include 16% VAT)
        </label>
      </div>

      <h3>How do you deliver?</h3>
      <p className="muted small">Buyers will see these options with prices to their town.</p>
      <div className="courier-pick">
        {couriers.map((c) => (
          <label key={c.id} className={`pay-option ${form.couriers.includes(c.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={form.couriers.includes(c.id)} onChange={() => toggleCourier(c.id)} />
            <span className="pay-icon">{c.icon}</span>
            <span>
              <strong>{c.name}</strong>
              <span className="muted small block">{c.description}</span>
            </span>
          </label>
        ))}
      </div>
      {errors.couriers && <span className="error">{errors.couriers}</span>}

      {form.couriers.includes('seller') && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rate-town">Your delivery fee, same town (K)</label>
            <input
              id="rate-town"
              type="number"
              min="0"
              value={form.ownRates.town}
              onChange={(e) => setForm((f) => ({ ...f, ownRates: { ...f.ownRates, town: e.target.value } }))}
            />
          </div>
          <div className="field">
            <label htmlFor="rate-prov">Other towns in your province (K), blank = don't deliver</label>
            <input
              id="rate-prov"
              type="number"
              min="0"
              value={form.ownRates.province}
              onChange={(e) => setForm((f) => ({ ...f, ownRates: { ...f.ownRates, province: e.target.value } }))}
            />
          </div>
        </div>
      )}

      {errors.form && <p className="error">{errors.form}</p>}
      <button className="btn btn-primary btn-lg btn-block" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
