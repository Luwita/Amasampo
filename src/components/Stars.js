// Read-only star rating, or a 1–5 picker when `onChange` is given.
export default function Stars({ value = 0, onChange, size = 'md' }) {
  if (!onChange) {
    const full = Math.round(value);
    return (
      <span className={`stars stars-${size}`} aria-label={`${value} out of 5 stars`}>
        {'★'.repeat(full)}
        <span className="stars-empty">{'★'.repeat(5 - full)}</span>
      </span>
    );
  }
  return (
    <span className={`stars stars-${size} stars-input`} role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'on' : ''}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}
