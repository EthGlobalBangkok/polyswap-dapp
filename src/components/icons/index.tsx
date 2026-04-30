import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Flag,
  Globe2,
  Lock,
  Menu,
  Percent,
  Plus,
  Search,
  Shield,
  Timer,
  Trash2,
  Wallet,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { MarketCategory } from "@/types/design";

export type IconComponent = (props: LucideProps) => React.ReactNode;

export const Icon = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  coin: Coins,
  flag: Flag,
  globe: Globe2,
  lock: Lock,
  menu: Menu,
  percent: Percent,
  plus: Plus,
  search: Search,
  shield: Shield,
  timer: Timer,
  trash: Trash2,
  wallet: Wallet,
  x: X,
  zap: Zap,
} as const;

const CATEGORY_ICON: Record<MarketCategory, keyof typeof Icon> = {
  Macro: "percent",
  Politics: "flag",
  Crypto: "coin",
  Geopolitics: "globe",
};

export function CategoryIcon({
  category,
  size = 16,
  className,
}: {
  category: MarketCategory;
  size?: number;
  className?: string;
}) {
  const Cmp = Icon[CATEGORY_ICON[category]];
  return <Cmp size={size} className={className} aria-hidden />;
}
