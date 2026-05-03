import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CloudSun,
  Coins,
  Cpu,
  Drama,
  Flag,
  Gamepad2,
  Globe2,
  LineChart,
  Lock,
  Menu,
  Music,
  Percent,
  Plus,
  Search,
  Shield,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Vote,
  Wallet,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { MarketCategory } from "@/types/design";

export type IconComponent = (props: LucideProps) => React.ReactNode;

export const Icon = {
  ai: BrainCircuit,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  cloudSun: CloudSun,
  coin: Coins,
  cpu: Cpu,
  drama: Drama,
  flag: Flag,
  gamepad: Gamepad2,
  globe: Globe2,
  lineChart: LineChart,
  lock: Lock,
  menu: Menu,
  music: Music,
  percent: Percent,
  plus: Plus,
  search: Search,
  shield: Shield,
  timer: Timer,
  trash: Trash2,
  trendingUp: TrendingUp,
  trophy: Trophy,
  vote: Vote,
  wallet: Wallet,
  x: X,
  zap: Zap,
} as const;

const CATEGORY_ICON: Record<MarketCategory, keyof typeof Icon> = {
  Politics: "flag",
  Elections: "vote",
  Geopolitics: "globe",
  Crypto: "coin",
  Sports: "trophy",
  Soccer: "trophy",
  Esports: "gamepad",
  Tech: "cpu",
  AI: "ai",
  Culture: "drama",
  Finance: "lineChart",
  Economy: "trendingUp",
  Weather: "cloudSun",
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
