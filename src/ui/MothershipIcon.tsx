/**
 * ### MothershipIcon
 *
 * The app mark: a mothership beaming down a small ship, the way it sends
 * work out to agents. A line icon in `currentColor`; the same drawing is the
 * favicon (`src/app/icon.svg`, in teal).
 */
export function MothershipIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 7.2a4 4 0 0 1 8 0" />
      <ellipse cx="12" cy="9" rx="10" ry="3" />
      <path d="M8 9.5h.01M12 10h.01M16 9.5h.01" />
      <path d="M8.8 11.9 6 21M15.2 11.9 18 21" />
      <path d="M9.6 18.6a2.4 2.2 0 0 1 4.8 0M8.6 18.6h6.8" />
    </svg>
  );
}
