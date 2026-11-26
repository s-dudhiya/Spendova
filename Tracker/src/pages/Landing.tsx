import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  Minus,
  Monitor,
  Moon,
  Plus,
  Smartphone,
  Sun,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { APP_VERSION } from "@/lib/version";

const REPO = "s-dudhiya/Spendova";
const RELEASE_TAG_API_URL = `https://api.github.com/repos/${REPO}/releases/tags/v-latest`;
const RELEASE_LATEST_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const FALLBACK_APK_URL = `https://github.com/${REPO}/releases/download/v-latest/Spendova_v${APP_VERSION}.apk`;

const AndroidIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0002s.4482-1.0002.9993-1.0002c.5516 0 .9997.4486.9997 1.0002s-.4481 1.0002-.9997 1.0002m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0002s.4482-1.0002.9993-1.0002c.5516 0 .9997.4486.9997 1.0002s-.4481 1.0002-.9997 1.0002m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.12 12 8.12s-3.5902.2916-5.1368.8306L4.8409 5.4475a.416.416 0 00-.5676-.1521.416.416 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396" />
  </svg>
);

export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  const [version, setVersion] = useState(APP_VERSION);
  const [apkUrl, setApkUrl] = useState(FALLBACK_APK_URL);
  const [apkSize, setApkSize] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"get" | "owe">("get");
  const [scrollPct, setScrollPct] = useState(0);
  const [featureIdx, setFeatureIdx] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);

  const features = [
    {
      icon: Zap,
      title: "Smart Debt Simplification",
      desc: "When 3 or more people owe each other in a group, Spendova simplifies circular debts into the fewest direct transfers.",
      tags: [
        { label: "Invariance verified", cls: "bg-success/15 text-success" },
        { label: "Debt Engine", cls: "bg-primary/15 text-primary" },
      ],
    },
    {
      icon: Users,
      title: "Group & 1-on-1 Splits",
      desc: "Split trips, rent, groceries, or dinners with equal, exact, percentage, or share-based splits and multiple payers.",
      tags: [
        { label: "Equal · Exact · %", cls: "bg-success/15 text-success" },
        { label: "Multi-payer", cls: "bg-primary/15 text-primary" },
      ],
    },
    {
      icon: BarChart3,
      title: "Personal Budgets & Ledgers",
      desc: "Track individual spending, monthly trends, custom categories, and shared household ledgers in one place.",
      tags: [
        { label: "Live charts", cls: "bg-success/15 text-success" },
        { label: "Ledgers", cls: "bg-primary/15 text-primary" },
      ],
    },
    {
      icon: Bell,
      title: "Push Alerts & Reminders",
      desc: "Instant alerts for shared activity and 1-tap payment reminders directly from the You Get drawer.",
      tags: [
        { label: "Instant push", cls: "bg-success/15 text-success" },
        { label: "1-tap remind", cls: "bg-primary/15 text-primary" },
      ],
    },
    {
      icon: Lock,
      title: "Biometric Lock & Privacy",
      desc: "Protect your financial records with optional Android fingerprint lock on launch.",
      tags: [
        { label: "Fingerprint ready", cls: "bg-success/15 text-success" },
        { label: "Device lock", cls: "bg-primary/15 text-primary" },
      ],
    },
    {
      icon: Smartphone,
      title: "Native Android Experience",
      desc: "Contacts friend matching, back-swipe navigation, and 1-tap in-app updates.",
      tags: [
        { label: "Contacts sync", cls: "bg-success/15 text-success" },
        { label: "Auto updates", cls: "bg-primary/15 text-primary" },
      ],
    },
  ];

  useEffect(() => {
    if (carouselPaused) return;
    const id = window.setInterval(() => {
      setFeatureIdx((prev) => (prev + 1) % features.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [carouselPaused, features.length]);

  useEffect(() => {
    const onScroll = () => {
      const top = window.scrollY;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(height > 0 ? Math.min(100, (top / height) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let active = true;
    const headers = { Accept: "application/vnd.github.v3+json" };

    const applyRelease = (data: {
      body?: string;
      name?: string;
      tag_name?: string;
      assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
    }) => {
      const body = String(data.body || "");
      const name = String(data.name || "");
      const tag = String(data.tag_name || "");
      const vMatch = body.match(/RELEASE_VERSION=([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
      const nMatch = name.match(/v?([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
      const tMatch = tag.match(/v?([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
      const resolvedVersion = vMatch?.[1] || nMatch?.[1] || tMatch?.[1] || APP_VERSION;
      setVersion(resolvedVersion);

      const apkAssets = (data.assets || []).filter(
        (a) => a.name && a.name.toLowerCase().endsWith(".apk")
      );
      const professionalAsset =
        apkAssets.find((a) => !a.name!.toLowerCase().includes("debug")) || apkAssets[0];

      if (professionalAsset?.browser_download_url) {
        setApkUrl(professionalAsset.browser_download_url);
      }
      if (professionalAsset?.size) {
        setApkSize(`${(professionalAsset.size / (1024 * 1024)).toFixed(1)} MB`);
      }
    };

    fetch(RELEASE_TAG_API_URL, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return null;
        if (data?.assets?.length) {
          applyRelease(data);
          return null;
        }
        return fetch(RELEASE_LATEST_API_URL, { headers }).then((r) => (r.ok ? r.json() : null));
      })
      .then((fallbackData) => {
        if (active && fallbackData) {
          applyRelease(fallbackData);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const apkFilename = `Spendova_v${version}.apk`;

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Top Scroll Progress Hairline */}
      <div
        className="fixed top-0 left-0 z-[60] h-[2px] bg-primary transition-[width] duration-75 ease-out pointer-events-none"
        style={{ width: `${scrollPct}%` }}
      />

      {/* Header / Navigation Bar */}
      <header className="fixed top-0 inset-x-0 z-50 md:px-6 md:pt-3.5 pointer-events-none">
        <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-2 md:gap-3 border-b md:border border-border/70 bg-card/90 md:bg-card/85 px-3.5 py-2.5 md:rounded-full md:px-5 md:py-2.5 backdrop-blur-xl shadow-soft transition-colors duration-200">
          <a href="#" className="flex items-center shrink-0 transition hover:opacity-90" aria-label="Spendova home">
            <img
              src={theme === "dark" ? "/brand/navbar-logo-dark.png" : "/brand/navbar-logo.png"}
              alt="Spendova — Split. Track. Grow."
              className="h-9 md:h-10 w-auto object-contain select-none"
            />
          </a>

          <nav className="hidden md:flex items-center gap-1 rounded-full bg-background/60 border border-border/50 p-1.5 text-sm font-semibold text-muted-foreground">
            <a href="#features" className="rounded-full px-4 py-1.5 transition-all hover:bg-card hover:text-foreground hover:shadow-soft whitespace-nowrap">Features</a>
            <a href="#how-it-works" className="rounded-full px-4 py-1.5 transition-all hover:bg-card hover:text-foreground hover:shadow-soft whitespace-nowrap">Debt Engine</a>
            <a href="#install-guide" className="rounded-full px-4 py-1.5 transition-all hover:bg-card hover:text-foreground hover:shadow-soft whitespace-nowrap">Install App</a>
            <a href="#faq" className="rounded-full px-4 py-1.5 transition-all hover:bg-card hover:text-foreground hover:shadow-soft whitespace-nowrap">FAQ</a>
          </nav>

          <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="grid size-9 md:size-10 place-items-center rounded-full bg-background/80 border border-border/60 text-foreground shadow-soft transition hover:bg-elevated active:scale-95"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="size-4 text-warning" />
              ) : (
                <Moon className="size-4 text-primary" />
              )}
            </button>

            <Link
              to="/login"
              className="inline-flex h-9 md:h-10 items-center gap-1.5 rounded-full bg-background/80 border border-border/60 px-3 md:px-4 text-xs md:text-sm font-bold text-foreground shadow-soft transition hover:bg-elevated whitespace-nowrap"
            >
              <span className="sm:hidden">Web</span>
              <span className="hidden sm:inline">Web App</span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </Link>

            <a
              href={apkUrl}
              download={apkFilename}
              className="inline-flex h-9 md:h-10 items-center gap-1.5 md:gap-2 rounded-full bg-primary px-3 md:px-4 text-xs md:text-sm font-bold text-primary-foreground shadow-primary-action transition hover:brightness-105 active:scale-95 whitespace-nowrap"
            >
              <AndroidIcon className="size-3.5 md:size-4 shrink-0" />
              <span className="sm:hidden">Get App</span>
              <span className="hidden sm:inline">Download App</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 pt-24 pb-12 sm:px-8 sm:pt-28 sm:pb-16">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-card border border-border/60 px-3.5 py-1.5 text-xs font-bold text-foreground shadow-soft mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <span className="size-2 rounded-full bg-success" />
            <span>Spendova v{version} · Latest Android Release</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-[3.35rem] leading-[1.12] animate-in fade-in slide-in-from-bottom-3 duration-500">
            Smarter Spending.
            <br />
            <span className="text-primary">Seamless Bill Splitting.</span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-lg font-medium leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-3 duration-500">
            Track personal budgets, split shared expenses with friends, simplify group debts automatically, and receive instant payment reminders.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={apkUrl}
              download={apkFilename}
              className="group inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-primary-action transition hover:brightness-105 active:scale-95"
            >
              <AndroidIcon className="size-4 shrink-0" />
              <span>Download Android App</span>
            </a>

            <Link
              to="/login"
              className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-card border border-border/60 px-6 text-sm font-bold text-foreground shadow-soft transition hover:bg-elevated"
            >
              <Monitor className="size-4 text-primary" />
              <span>Open Web App</span>
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-y-2 gap-x-5 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-success" />
              <span>Version {version}</span>
            </span>
            {apkSize && (
              <>
                <span className="opacity-40">•</span>
                <span className="flex items-center gap-1.5">
                  <Upload className="size-3.5 text-primary" />
                  <span>Size: {apkSize}</span>
                </span>
              </>
            )}
            <span className="opacity-40">•</span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              <span>Direct Download</span>
            </span>
          </div>

          {/* Authentic Spendova App Overview Preview */}
          <div className="mt-12 mx-auto max-w-2xl">
            <div className="rounded-[1.5rem] bg-card border border-border/50 p-4 sm:p-6 text-left shadow-panel">
              <div className="flex items-center justify-between pb-4 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <img src="/brand/spendova-symbol.png" alt="Spendova" className="size-7 object-contain" />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Overview</p>
                    <p className="text-sm font-black text-foreground">Personal &amp; Split Balances</p>
                  </div>
                </div>
                <span className="grid size-9 place-items-center rounded-full bg-elevated text-foreground">
                  <Bell className="size-4" />
                </span>
              </div>

              <div className="mt-4 rounded-[1.25rem] bg-elevated p-5 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Net balance</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
                    +12.4% this month
                  </span>
                </div>
                <p className="spendova-money-value mt-1 text-3xl font-extrabold text-foreground">₹1,130.00</p>

                <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("get")}
                    className={`rounded-2xl bg-card p-3 text-left transition ${previewTab === "get" ? "ring-2 ring-primary/40" : "hover:bg-card/80"}`}
                  >
                    <p className="text-xs font-semibold text-muted-foreground">You Get</p>
                    <p className="spendova-money-value mt-0.5 text-lg sm:text-xl font-black text-success">₹1,450.00</p>
                    <p className="text-[11px] font-medium text-muted-foreground">from 3 friends</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("owe")}
                    className={`rounded-2xl bg-card p-3 text-left transition ${previewTab === "owe" ? "ring-2 ring-primary/40" : "hover:bg-card/80"}`}
                  >
                    <p className="text-xs font-semibold text-muted-foreground">You Owe</p>
                    <p className="spendova-money-value mt-0.5 text-lg sm:text-xl font-black text-warning">₹320.00</p>
                    <p className="text-[11px] font-medium text-muted-foreground">in Trip Group</p>
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-card/80 px-3 py-2 text-xs transition-all duration-200">
                  <span className="font-semibold text-foreground truncate">
                    {previewTab === "get" ? "James Davis owes you ₹850.00" : "You owe Charles Miller ₹320.00"}
                  </span>
                  <span className="shrink-0 rounded-lg bg-primary/15 px-2.5 py-1 font-bold text-primary">
                    {previewTab === "get" ? "Remind · Settle" : "Settle Now"}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-[1.25rem] bg-primary px-4 py-3 text-primary-foreground shadow-primary-action">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/15">+</span>
                  <div>
                    <p className="text-sm font-black leading-tight">Add Expense</p>
                    <p className="text-[11px] font-semibold opacity-85">Track a new expense</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-[1.25rem] bg-elevated px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">Split &amp; Settle</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Auto-simplified debts</p>
                  </div>
                  <span className="spendova-money-value text-sm font-black text-foreground">₹1,770</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Focus Carousel (Main.dc.html style) */}
      <section id="features" className="border-t border-border/60 bg-surface px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">WHY SPENDOVA</p>
            <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Everything you need to manage money and shared bills.
            </h2>
            <p className="mt-1.5 text-sm sm:text-base text-muted-foreground">Built for accuracy, privacy, and everyday speed.</p>
          </div>

          {(() => {
            const total = features.length;
            const prevIdx = (featureIdx - 1 + total) % total;
            const nextIdx = (featureIdx + 1) % total;
            const prevItem = features[prevIdx];
            const curItem = features[featureIdx];
            const nextItem = features[nextIdx];
            const PrevIcon = prevItem.icon;
            const CurIcon = curItem.icon;
            const NextIcon = nextItem.icon;

            return (
              <div className="mt-8 flex items-center justify-center gap-4 lg:gap-6 select-none">
                <button
                  key={`prev-${prevItem.title}`}
                  type="button"
                  onClick={() => setFeatureIdx(prevIdx)}
                  className="hidden md:flex w-[270px] lg:w-[290px] h-[300px] shrink-0 flex-col justify-between rounded-[24px] bg-card/65 border border-border/50 p-5 text-left opacity-75 shadow-soft transition-all duration-300 hover:opacity-95 hover:-translate-y-0.5 cursor-pointer animate-in fade-in slide-in-from-right-4 duration-300"
                >
                  <div>
                    <div className="h-24 rounded-2xl bg-elevated flex items-center justify-center text-primary">
                      <PrevIcon className="size-6" />
                    </div>
                    <h3 className="mt-3.5 text-lg font-bold text-foreground">{prevItem.title}</h3>
                    <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-muted-foreground line-clamp-3">{prevItem.desc}</p>
                  </div>
                </button>

                <div
                  key={curItem.title}
                  className="w-full max-w-[420px] min-h-[360px] sm:min-h-[380px] shrink-0 flex flex-col justify-between rounded-[28px] bg-card border border-primary/25 p-6 shadow-panel animate-in fade-in slide-in-from-right-4 duration-300"
                >
                  <div>
                    <div
                      className="h-32 sm:h-36 rounded-[20px] flex items-center justify-center shadow-soft"
                      style={{ background: "linear-gradient(135deg, hsl(var(--primary)), #4F2BB8)" }}
                    >
                      <div
                        className="grid size-20 place-items-center rounded-full bg-white/15 text-white"
                        style={{ boxShadow: "0 0 0 10px rgba(255,255,255,0.10), 0 0 0 22px rgba(255,255,255,0.06)" }}
                      >
                        <CurIcon className="size-9" />
                      </div>
                    </div>
                    <h3 className="mt-5 text-xl font-extrabold tracking-tight text-foreground">{curItem.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{curItem.desc}</p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {curItem.tags.map((t) => (
                      <span key={t.label} className={`rounded-full px-3 py-1 text-xs font-bold ${t.cls}`}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  key={`next-${nextItem.title}`}
                  type="button"
                  onClick={() => setFeatureIdx(nextIdx)}
                  className="hidden lg:flex w-[270px] lg:w-[290px] h-[300px] shrink-0 flex-col justify-between rounded-[24px] bg-card/65 border border-border/50 p-5 text-left opacity-75 shadow-soft transition-all duration-300 hover:opacity-95 hover:-translate-y-0.5 cursor-pointer animate-in fade-in slide-in-from-right-4 duration-300"
                >
                  <div>
                    <div className="h-24 rounded-2xl bg-elevated flex items-center justify-center text-primary">
                      <NextIcon className="size-6" />
                    </div>
                    <h3 className="mt-3.5 text-lg font-bold text-foreground">{nextItem.title}</h3>
                    <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-muted-foreground line-clamp-3">{nextItem.desc}</p>
                  </div>
                </button>
              </div>
            );
          })()}

          <div className="mt-6 flex items-center justify-center gap-1.5">
            {features.map((item, idx) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setFeatureIdx(idx)}
                aria-label={`Go to ${item.title}`}
                className={
                  idx === featureIdx
                    ? "h-1 w-14 rounded-full bg-primary transition-all duration-300"
                    : "h-1 w-7 rounded-full bg-border hover:bg-primary/50 transition-all duration-300"
                }
              />
            ))}
          </div>
        </div>
      </section>

      {/* How Debt Simplification Works Section */}
      <section id="how-it-works" className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-2 items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">Math Made Simple</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">Say goodbye to confusing transfers.</h2>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-muted-foreground">
                In group trips, everyone pays for different things. Traditional trackers force multiple back-and-forth payments between every pair.
              </p>
              <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">
                Spendova evaluates net positions and <strong className="text-foreground">cancels out circular debts</strong> automatically so everyone settles up in the fewest transfers.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3.5 py-1.5 text-xs font-bold text-success">✓ Invariance Guaranteed</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3.5 py-1.5 text-xs font-bold text-primary">✓ One-Tap Toggle</span>
              </div>
            </div>

            <div className="rounded-[1.25rem] bg-card border border-border/50 p-6 shadow-panel">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Example Scenario: 3 Friends</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-1.5 p-3 sm:p-3.5 rounded-2xl bg-elevated">
                  <span className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Without Simplification</span>
                  <span className="text-[10.5px] sm:text-xs font-bold text-warning bg-warning/15 px-2 sm:px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">3 separate transfers</span>
                </div>
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/25">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">With Spendova Simplification</span>
                  <p className="mt-1.5 text-sm font-bold text-foreground">Charlie pays ₹300 directly to Bob.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Alice's net is ₹0. Everyone is settled in 1 payment.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How to Install APK Section */}
      <section id="install-guide" className="border-t border-border/60 bg-surface px-4 pt-10 pb-8 sm:px-8 sm:pt-14 sm:pb-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10 items-center">
            <div className="md:col-span-5 text-center md:text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">Android Setup</p>
              <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                Install Spendova on Android
              </h2>
              <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-muted-foreground max-w-md mx-auto md:mx-0">
                Download the signed APK directly from GitHub Releases and install it right on your phone—no Play Store wait.
              </p>

              <div className="mt-5 mx-auto md:mx-0 max-w-md rounded-2xl bg-card border border-border/60 p-3 sm:p-3.5 shadow-soft flex items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <AndroidIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs sm:text-sm font-bold text-foreground">{apkFilename}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Release v{version}{apkSize ? ` · ${apkSize}` : ""}
                    </p>
                  </div>
                </div>

                <a
                  href={apkUrl}
                  download={apkFilename}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground shadow-primary-action transition hover:brightness-105 active:scale-95"
                >
                  <ArrowDown className="size-3.5" />
                  <span>Download</span>
                </a>
              </div>
            </div>

            <div className="md:col-span-7 rounded-[1.25rem] bg-card border border-border/60 shadow-soft divide-y divide-border/50 overflow-hidden">
              {[
                {
                  step: "01",
                  title: "Download the APK",
                  body: (
                    <>
                      Save <code className="text-xs bg-elevated px-1.5 py-0.5 rounded font-semibold text-foreground">{apkFilename}</code> directly to your device.
                    </>
                  ),
                },
                {
                  step: "02",
                  title: "Open the downloaded file",
                  body: (
                    <>
                      Tap the download notification or open it from <em>Files &gt; Downloads</em>.
                    </>
                  ),
                },
                {
                  step: "03",
                  title: "Allow & install",
                  body: (
                    <>
                      If Android prompts for <em>&ldquo;Install unknown apps&rdquo;</em>, tap <strong>Settings</strong> &gt; <strong>Allow</strong>, then tap <strong>Install</strong>.
                    </>
                  ),
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4 px-4 py-4 sm:px-5 sm:py-4.5">
                  <span className="mt-0.5 inline-flex h-7 min-w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 px-2 font-mono text-xs font-bold text-primary">
                    {item.step}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-[15px] font-bold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="px-4 pt-6 pb-8 sm:px-8 sm:pt-8 sm:pb-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-10 items-start">
            <div className="md:col-span-5 text-center md:text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">FAQ</p>
              <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Frequently Asked Questions</h2>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground max-w-md mx-auto md:mx-0">
                Quick answers about pricing, cross-platform access, updates, and data security.
              </p>
            </div>

            <div className="md:col-span-7 rounded-[1.25rem] bg-card border border-border/60 shadow-soft divide-y divide-border/50 overflow-hidden">
              {[
                { q: "Is Spendova free to use?", a: "Yes. Spendova is free with no ads or subscription fees for creating groups, splitting expenses, and downloading updates." },
                { q: "Can I use Spendova on iPhone or PC?", a: "Yes. While the APK download is for Android devices, Spendova's responsive web app works in Safari, Chrome, Edge, and Firefox on any phone or desktop." },
                { q: "How will I get future app updates?", a: "Spendova includes an in-app update checker that notifies you whenever a new version is released, or you can download the latest APK here anytime." },
                { q: "Is my financial data secure?", a: "All data is encrypted in transit and at rest with strict row-level access controls and optional biometric lock on app launch." },
              ].map((faq) => (
                <details
                  key={faq.q}
                  className="group cursor-pointer transition-colors hover:bg-elevated/40 open:bg-elevated/25"
                >
                  <summary className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4 font-bold text-sm sm:text-[15px] text-foreground select-none list-none">
                    <span>{faq.q}</span>
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-background/70 border border-border/50 text-muted-foreground transition-colors duration-200 group-open:text-primary group-open:border-primary/30">
                      <Plus className="size-3.5 group-open:hidden" />
                      <Minus className="size-3.5 hidden group-open:block" />
                    </span>
                  </summary>
                  <p className="px-4 pb-4 sm:px-5 sm:pb-4 text-xs sm:text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-9">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-12 md:gap-8">
            {/* Brand Column */}
            <div className="col-span-2 md:col-span-6 space-y-2">
              <a href="#" className="inline-flex items-center gap-2 transition hover:opacity-90" aria-label="Spendova home">
                <img src="/brand/spendova-symbol.png" alt="Spendova" className="size-7 object-contain" />
                <span className="text-base font-extrabold tracking-tight text-foreground">Spendova</span>
              </a>
              <p className="max-w-sm text-xs sm:text-sm leading-relaxed text-muted-foreground">
                Track personal budgets, split group bills fairly, and simplify shared debts automatically across Android and Web.
              </p>
            </div>

            {/* Product Links */}
            <div className="col-span-1 md:col-span-3 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Product</h3>
              <ul className="space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><a href="#features" className="transition-colors hover:text-foreground">Features</a></li>
                <li><a href="#how-it-works" className="transition-colors hover:text-foreground">Debt Engine</a></li>
                <li><a href="#install-guide" className="transition-colors hover:text-foreground">Install Guide</a></li>
                <li><a href="#faq" className="transition-colors hover:text-foreground">FAQ</a></li>
              </ul>
            </div>

            {/* Platforms Links */}
            <div className="col-span-1 md:col-span-3 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Platforms</h3>
              <ul className="space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                <li><Link to="/login" className="transition-colors hover:text-foreground">Web App</Link></li>
                <li><a href={apkUrl} download={apkFilename} className="transition-colors hover:text-foreground">Android APK</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground sm:flex-row">
            <p>© 2026 Spendova. All rights reserved.</p>
            <p>Split. Track. Grow.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
