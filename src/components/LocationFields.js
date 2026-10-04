import { getProvince, provinces } from '../data/zambia';

// Province + town selects. `value` is { province, town }.
export default function LocationFields({ value, onChange, idPrefix = 'loc' }) {
  const province = getProvince(value.province) ?? provinces[0];
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-province`}>Province</label>
        <select
          id={`${idPrefix}-province`}
          value={province.id}
          onChange={(e) => {
            const next = getProvince(e.target.value);
            onChange({ ...value, province: next.id, town: next.towns[0] });
          }}
        >
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-town`}>Town</label>
        <select
          id={`${idPrefix}-town`}
          value={value.town}
          onChange={(e) => onChange({ ...value, town: e.target.value })}
        >
          {province.towns.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
    </>
  );
}
