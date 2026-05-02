import Image from "next/image";
import type { MarketCategory } from "@/types/design";

interface Props {
  category: MarketCategory;
  size?: number;
  className?: string;
}

const GLYPHS: Record<MarketCategory, { src: string; alt: string }> = {
  Macro: { src: "/landing/glyph/glyph_1.png", alt: "Trendline chart with percent marks" },
  Politics: { src: "/landing/glyph/glyph_2.png", alt: "Capitol building with a flag" },
  Crypto: { src: "/landing/glyph/glyph_3.png", alt: "Bitcoin coin with an up arrow" },
  Geopolitics: { src: "/landing/glyph/glyph_4.png", alt: "Globe with a location pin" },
};

export function CatIllus({ category, size = 64, className }: Props) {
  const { src, alt } = GLYPHS[category];
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: "auto" }}
    />
  );
}
