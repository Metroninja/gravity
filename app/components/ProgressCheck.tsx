type Props = {
  completed: boolean;
  size?: number;
  label?: string;
};

export function ProgressCheck({ completed, size = 24, label }: Props) {
  return (
    <span
      role="img"
      aria-label={
        label ?? (completed ? "Voltooid" : "Nog niet voltooid")
      }
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 transition " +
        (completed
          ? "border-magenta bg-magenta text-white"
          : "border-off-black/30 bg-white text-off-black/30")
      }
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.7} height={size * 0.7} aria-hidden="true">
        <path
          d="M5 12.5l4 4 10-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
