interface Props {
  size?: number;
  className?: string;
}

export function PolymarketIcon({ size = 20, className }: Props) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/polymarket-logo.svg"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ display: "block" }}
    />
  );
}
