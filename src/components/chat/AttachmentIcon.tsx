interface AttachmentIconProps {
  className?: string;
}

export function AttachmentIcon({ className }: AttachmentIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Capsule rotated 45° clockwise - from bottom-left to top-right */}
      <rect
        x="6.5"
        y="2.5"
        width="11"
        height="19"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        transform="rotate(45 12 12)"
      />
      {/* Two dots inside - positioned diagonally along capsule axis */}
      <circle cx="9.5" cy="9.5" r="1.6" fill="currentColor" />
      <circle cx="14.5" cy="14.5" r="1.6" fill="currentColor" />
      {/* Small chevron "v" at bottom right outside capsule */}
      <path 
        d="M18 19L20 21L22 19" 
        stroke="currentColor" 
        strokeWidth="1.6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
