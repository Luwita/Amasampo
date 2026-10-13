// Line icons for the phone layout (tab bar, header, shortcuts). They take the colour of the surrounding text.
const paths = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5.5h16v10.5H9.5L5 20v-4H4z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </>
  ),
  cart: (
    <>
      <path d="M2.5 4h2.6l2.3 10.5h10.4L20 7H6" />
      <circle cx="9" cy="18.7" r="1.4" />
      <circle cx="16.5" cy="18.7" r="1.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" />
      <path d="M10 20.5a2.1 2.1 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  back: <path d="M15 4.5 7.5 12l7.5 7.5" />,
  filter: (
    <>
      <path d="M4 6.5h16M7 12h10M10 17.5h4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s6.5-5.8 6.5-11a6.5 6.5 0 0 0-13 0c0 5.2 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.5a2.4 2.4 0 1 1 3.5 2.2c-.8.4-1.2 1-1.2 1.8" />
      <path d="M12 16.7v.1" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h11v9.5h-11zM13.5 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17" cy="17.5" r="1.7" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
};

export default function Icon({ name, size = 24 }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
