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
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { APP_VERSION } from "@/lib/version";

const REPO = "s-dudhiya/Spendova";
const RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/tags/v-latest`;
const FALLBACK_APK_URL = `https://github.com/${REPO}/releases/download/v-latest/Spendova-debug.apk`;

const AndroidIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0002s.4482-1.0002.9993-1.0002c.5516 0 .9997.4486.9997 1.0002s-.4481 1.0002-.9997 1.0002m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0002s.4482-1.0002.9993-1.0002c.5516 0 .9997.4486.9997 1.0002s-.4481 1.0002-.9997 1.0002m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.12 12 8.12s-3.5902.2916-5.1368.8306L4.8409 5.4475a.416.416 0 00-.5676-.1521.416.416 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396" />
  </svg>
);

export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  const [version, setVersion] = useState(APP_VERSION);
  const [apkUrl, setApkUrl] = useState(FALLBACK_APK_URL);
  const [apkSize, setApkSize] = useState("~12 MB");

  useEffect(() => {
    let active = true;
    fetch(RELEASE_API_URL, { headers: { Accept: "application/vnd.github.v3+json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;

        const body = String(data.body || "");
        const name = String(data.name || "");
        const vMatch = body.match(/RELEASE_VERSION=([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
        const nMatch = name.match(/v?([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
        const resolvedVersion = vMatch?.[1] || nMatch?.[1] || APP_VERSION;
        setVersion(resolvedVersion);

        const apkAssets = (data.assets || []).filter(
          (a: { name?: string }) => a.name && a.name.toLowerCase().endsWith(".apk")
        );
        const professionalAsset =
          apkAssets.find((a: { name: string }) => !a.name.toLowerCase().includes("debug")) || apkAssets[0];

        if (professionalAsset?.browser_download_url) {
          setApkUrl(professionalAsset.browser_download_url);
        }
        if (professionalAsset?.size) {
          setApkSize(`${(professionalAsset.size / (1024 * 1024)).toFixed(1)} MB`);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const apkFilename = `Spendova_v${version}.apk`;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Header / Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <a href="#" className="flex items-center transition hover:opacity-90" aria-label="Spendova home">
            <img
              src={theme === "dark" ? "/brand/navbar-logo-dark.png" : "/brand/navbar-logo.png"}
              alt="Spendova — Split. Track. Grow."
              className="h-9 sm:h-10 md:h-11 w-auto object-contain select-none"
            />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-muted-foreground">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#how-it-works" className="transition hover:text-foreground">Debt Engine</a>
            <a href="#install-guide" className="transition hover:text-foreground">Install App</a>
            <a href="#faq" className="transition hover:text-foreground">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="grid size-9 place-items-center rounded-full bg-card border border-border/60 text-foreground shadow-soft transition hover:bg-elevated"
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
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-card border border-border/60 px-4 py-2 text-xs font-bold text-foreground shadow-soft transition hover:bg-elevated"
            >
              <span>Web App</span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </Link>

            <a
              href={apkUrl}
              download={apkFilename}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs sm:text-sm font-bold text-primary-foreground shadow-primary-action transition hover:brightness-105 active:scale-95"
            >
              <AndroidIcon className="size-4 shrink-0" />
              <span>Download App</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-5 pt-12 pb-16 sm:px-8 sm:pt-20 sm:pb-24">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-card border border-border/60 px-4 py-1.5 text-xs font-bold text-foreground shadow-soft mb-6">
            <span className="size-2 rounded-full bg-success" />
            <span>Spendova v{version} · Latest Android Release</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-[3.5rem] leading-[1.12]">
            Smarter Spending.
            <br />
            <span className="text-primary">Seamless Bill Splitting.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg font-medium leading-relaxed text-muted-foreground">
            Track personal budgets, split shared expenses with friends, simplify group debts automatically, and receive instant payment reminders.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <a
              href={apkUrl}
              download={apkFilename}
              className="group flex w-full sm:w-auto items-center justify-center gap-3.5 rounded-2xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-primary-action transition hover:brightness-105 active:scale-95"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-black/15 dark:bg-black/20">
                <AndroidIcon className="size-5" />
              </span>
              <span className="text-left">
                <span className="block text-[11px] font-semibold uppercase tracking-wider opacity-85">Official Android APK</span>
                <span className="block text-base font-extrabold">Download Spendova App</span>
              </span>
              <ArrowDown className="ml-1 size-5 opacity-85 transition group-hover:translate-y-0.5" />
            </a>

            <Link
              to="/login"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-card border border-border/60 px-6 py-4 text-sm font-bold text-foreground shadow-soft transition hover:bg-elevated"
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
            <span className="opacity-40">•</span>
            <span className="flex items-center gap-1.5">
              <Upload className="size-3.5 text-primary" />
              <span>Size: {apkSize}</span>
            </span>
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

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-card p-3.5">
                    <p className="text-xs font-semibold text-muted-foreground">You Get</p>
                    <p className="spendova-money-value mt-1 text-lg sm:text-xl font-black text-success">₹1,450.00</p>
                    <p className="text-[11px] font-medium text-muted-foreground mt-0.5">from 3 friends</p>
                  </div>
                  <div className="rounded-2xl bg-card p-3.5">
                    <p className="text-xs font-semibold text-muted-foreground">You Owe</p>
                    <p className="spendova-money-value mt-1 text-lg sm:text-xl font-black text-warning">₹320.00</p>
                    <p className="text-[11px] font-medium text-muted-foreground mt-0.5">in Goa Trip</p>
                  </div>
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

      {/* Core Features Grid */}
      <section id="features" className="border-t border-border/60 bg-surface px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Why Spendova</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Everything you need to manage money and shared bills.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">Built for accuracy, privacy, and everyday speed.</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Zap, title: "Smart Debt Simplification", desc: "When 3 or more people owe each other in a group, Spendova simplifies circular debts into the fewest direct transfers." },
              { icon: Users, title: "Group & 1-on-1 Splits", desc: "Split trips, rent, groceries, or dinners with equal, exact, percentage, or share-based splits and multiple payers." },
              { icon: BarChart3, title: "Personal Budgets & Ledgers", desc: "Track individual spending, monthly trends, custom categories, and shared household ledgers in one place." },
              { icon: Bell, title: "Instant Push Alerts & Reminders", desc: "Get native push alerts when expenses or settlements are added, and send 1-tap payment reminders." },
              { icon: Lock, title: "Biometric Lock & Privacy", desc: "Protect your financial records with optional Android fingerprint and biometric lock on app launch." },
              { icon: Smartphone, title: "Native Android Experience", desc: "Includes Android system back-swipe navigation, contacts friend matching, and seamless in-app updates." },
            ].map((item) => (
              <div key={item.title} className="rounded-[1.25rem] bg-card border border-border/55 p-6 shadow-soft transition hover:shadow-panel hover:border-border">
                <div className="grid size-11 place-items-center rounded-full bg-primary/15 text-primary">
                  <item.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
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
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-elevated">
                  <span className="text-sm font-semibold text-foreground">Without Simplification</span>
                  <span className="text-xs font-bold text-warning bg-warning/15 px-2.5 py-1 rounded-full">3 separate transfers</span>
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
      <section id="install-guide" className="border-t border-border/60 bg-surface px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Quick Setup</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">Install Spendova on Android</h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">Takes less than 60 seconds.</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            <div className="rounded-[1.25rem] bg-card border border-border/55 p-6 text-center shadow-soft">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary text-base font-black text-primary-foreground shadow-primary-action">1</div>
              <h3 className="mt-4 text-base font-bold text-foreground">Download the App</h3>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                Tap <strong className="text-foreground">Download App</strong> to save the latest <code className="text-xs bg-elevated px-1.5 py-0.5 rounded font-semibold text-foreground">{apkFilename}</code> file.
              </p>
            </div>

            <div className="rounded-[1.25rem] bg-card border border-border/55 p-6 text-center shadow-soft">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary text-base font-black text-primary-foreground shadow-primary-action">2</div>
              <h3 className="mt-4 text-base font-bold text-foreground">Tap to Open</h3>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                Tap the completed download notification or open it from <em>Files &gt; Downloads</em>.
              </p>
            </div>

            <div className="rounded-[1.25rem] bg-card border border-border/55 p-6 text-center shadow-soft">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary text-base font-black text-primary-foreground shadow-primary-action">3</div>
              <h3 className="mt-4 text-base font-bold text-foreground">Allow &amp; Install</h3>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                If prompted for <em>"Install unknown apps"</em>, tap <strong>Settings</strong> &gt; <strong>Allow</strong>, then tap <strong>Install</strong>.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <a
              href={apkUrl}
              download={apkFilename}
              className="inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-primary-action transition hover:brightness-105 active:scale-95"
            >
              <ArrowDown className="size-4" />
              <span>Download Spendova App Now</span>
            </a>
          </div>
        </div>
      </section>

      {/* Latest Release Notes Box */}
      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-4xl rounded-[1.25rem] bg-card border border-border/50 p-6 sm:p-8 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Release Changelog</span>
              <h3 className="mt-1 text-xl font-bold flex items-center gap-2.5 text-foreground">
                <span>Spendova v{version}</span>
                <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-bold text-success">Stable</span>
              </h3>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">Latest Version</span>
          </div>

          <div className="mt-5 text-sm space-y-2.5 leading-relaxed text-muted-foreground">
            <p className="flex items-start gap-2">
              <span className="text-primary font-bold">✓</span>
              <span><strong className="text-foreground">Mobile Contacts Sync &amp; Invites</strong>: Find friends already on Spendova directly from your contacts.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-primary font-bold">✓</span>
              <span><strong className="text-foreground">One-Tap Payment Reminders</strong>: Send push and in-app reminders right from the You Get drawer.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-primary font-bold">✓</span>
              <span><strong className="text-foreground">Debt Simplification Engine</strong>: Verified invariance with partial settle-up protection.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-primary font-bold">✓</span>
              <span><strong className="text-foreground">Native Android Navigation</strong>: Smooth system back-swipe support with 2-tap exit safeguard.</span>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="border-t border-border/60 bg-surface px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">FAQ</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Frequently Asked Questions</h2>
          </div>

          <div className="mt-10 space-y-3.5">
            {[
              { q: "Is Spendova free to use?", a: "Yes. Spendova is free with no ads or subscription fees for creating groups, splitting expenses, and downloading updates." },
              { q: "Can I use Spendova on iPhone or PC?", a: "Yes. While the APK download is for Android devices, Spendova's responsive web app works in Safari, Chrome, Edge, and Firefox on any phone or desktop." },
              { q: "How will I get future app updates?", a: "Spendova includes an in-app update checker that notifies you whenever a new version is released, or you can download the latest APK here anytime." },
              { q: "Is my financial data secure?", a: "All data is encrypted in transit and at rest with strict row-level access controls and optional biometric lock on app launch." },
            ].map((faq) => (
              <details key={faq.q} className="group rounded-[1.25rem] bg-card border border-border/55 p-5 shadow-soft cursor-pointer">
                <summary className="flex items-center justify-between font-bold text-sm sm:text-base text-foreground select-none list-none">
                  <span>{faq.q}</span>
                  <span className="text-primary transition group-open:rotate-180">▼</span>
                </summary>
                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky Mobile Bottom Download Bar */}
      <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:hidden border-t border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <a
            href={apkUrl}
            download={apkFilename}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-primary-foreground shadow-primary-action"
          >
            <ArrowDown className="size-4" />
            <span>Download Spendova App</span>
          </a>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-full bg-card border border-border/60 px-4 py-3 text-xs font-bold text-foreground"
          >
            <span>Web App</span>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-surface px-5 py-10 pb-24 sm:pb-10 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-2">
            <img src="/brand/spendova-symbol.png" alt="Spendova" className="size-6 object-contain" />
            <span className="text-sm font-bold text-foreground">Spendova</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 font-medium">
            <a href="#features" className="hover:text-foreground transition">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition">Debt Engine</a>
            <a href="#install-guide" className="hover:text-foreground transition">Installation</a>
            <Link to="/login" className="hover:text-foreground transition">Web App</Link>
          </div>

          <p>© 2026 Spendova. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
