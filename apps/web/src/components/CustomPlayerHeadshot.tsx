/**
 * CustomPlayerHeadshot
 *
 * Generic baseball player silhouette used as a placeholder image
 * for manually added custom players who have no MLB headshot.
 *
 * Usage:
 *   <CustomPlayerHeadshot size={32} />
 *
 * Drop-in replacement for the <img> tag in PlayerTable and AuctionCenter
 * when player.headshot is empty and player.id starts with "custom_".
 */

interface CustomPlayerHeadshotProps {
  size?: number;
  className?: string;
}

export default function CustomPlayerHeadshot({
  size = 32,
  className = "",
}: CustomPlayerHeadshotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={"custom-headshot " + className}
      style={{ flexShrink: 0 }}
    >
      {/* Background circle */}
      <circle cx="16" cy="16" r="16" fill="rgba(139,92,246,0.15)" />
      <circle cx="16" cy="16" r="15.5" stroke="rgba(139,92,246,0.35)" strokeWidth="1" />

      {/* Helmet brim */}
      <path
        d="M7 15.5 Q7 9 16 9 Q23 9 24.5 14"
        stroke="rgba(167,139,250,0.9)"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Helmet dome */}
      <path
        d="M9 15.5 Q9 10.5 16 10.5 Q22.5 10.5 23.5 15"
        fill="rgba(139,92,246,0.45)"
        stroke="none"
      />
      {/* Helmet brim flat */}
      <path
        d="M6.5 15.8 L25.5 15.8"
        stroke="rgba(167,139,250,0.8)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Ear flap */}
      <path
        d="M9 15.8 Q7.5 17 8 19"
        stroke="rgba(139,92,246,0.7)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Head / face */}
      <ellipse cx="16" cy="19" rx="5" ry="5.5" fill="rgba(167,139,250,0.25)" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />

      {/* Shoulder / jersey */}
      <path
        d="M8 29 Q8 24 16 23.5 Q24 24 24 29"
        fill="rgba(139,92,246,0.3)"
        stroke="rgba(139,92,246,0.5)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Jersey number stripe hint */}
      <path
        d="M13.5 26 L18.5 26"
        stroke="rgba(167,139,250,0.5)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Clip bottom to circle */}
      <circle cx="16" cy="16" r="16" fill="none" />
    </svg>
  );
}