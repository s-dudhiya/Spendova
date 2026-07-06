import {
  PiggyBank,
  Wallet,
  Plane,
  Car,
  Home,
  Coffee,
  ShoppingCart,
  Heart,
  Gamepad2,
  Gift,
  GraduationCap,
  Baby,
  Briefcase,
  Dumbbell,
  Music,
  Smartphone,
  Tv,
  Utensils,
  Landmark,
  Building,
  Tent,
  Bus,
  Train,
  Ship,
  Camera,
  Shirt,
  type LucideIcon
} from "lucide-react";

export const LEDGER_ICONS: Record<string, LucideIcon> = {
  piggy: PiggyBank,
  wallet: Wallet,
  plane: Plane,
  car: Car,
  home: Home,
  coffee: Coffee,
  shopping: ShoppingCart,
  heart: Heart,
  gamepad: Gamepad2,
  gift: Gift,
  education: GraduationCap,
  baby: Baby,
  briefcase: Briefcase,
  fitness: Dumbbell,
  music: Music,
  phone: Smartphone,
  tv: Tv,
  food: Utensils,
  bank: Landmark,
  building: Building,
  tent: Tent,
  bus: Bus,
  train: Train,
  ship: Ship,
  camera: Camera,
  clothes: Shirt,
};

export const DEFAULT_LEDGER_ICON = "piggy";

export const getLedgerIcon = (iconName: string | null | undefined): LucideIcon => {
  if (!iconName || !LEDGER_ICONS[iconName]) return LEDGER_ICONS[DEFAULT_LEDGER_ICON];
  return LEDGER_ICONS[iconName];
};
