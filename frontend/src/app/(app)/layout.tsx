"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, ArrowLeftRight, Target, PieChart,
  Lightbulb, MessageSquare, TrendingUp, Settings, LogOut, Menu, X,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/chat", label: "Ask WealthView", icon: MessageSquare },
  { href: "/investments", label: "Investments", icon: TrendingUp },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, loading, initialize, clearAuth } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = initialize();
    return () => { unsub.then((fn) => fn?.()); };
  }, [initialize]);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace("/login");
  }, [loading, isAuthenticated, router]);

  // Close the mobile drawer on every navigation instead of leaving it open
  // over the new page.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (loading || !isAuthenticated) return null;

  const initials =
    user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  async function handleSignOut() {
    await clearAuth();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Mobile top bar — the sidebar is off-canvas below lg, so this is the
          only way to reach navigation on a phone-width iOS PWA. Padded for
          the safe-area inset so it clears the notch/status bar. */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-100 flex items-center justify-between px-4 pb-2.5 pt-[calc(0.625rem_+_env(safe-area-inset-top))]">
        <Link href="/dashboard">
          <img src="/logo.svg" alt="WealthView Duo" height={24} style={{ height: 24, width: "auto" }} />
        </Link>
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 -mr-2 rounded-lg text-gray-500 hover:bg-gray-50"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Backdrop — mobile only, closes the drawer on outside tap */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
        />
      )}

      <aside className={cn(
        "fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 flex flex-col z-50 shadow-sm",
        "transition-transform duration-200 lg:translate-x-0",
        menuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between pt-[calc(1.25rem_+_env(safe-area-inset-top))]">
          <Link href="/dashboard">
            <img src="/logo.svg" alt="WealthView Duo" height={28} style={{ height: 28, width: "auto" }} />
          </Link>
          <button
            onClick={() => setMenuOpen(false)}
            className="lg:hidden p-1 rounded-lg text-gray-400 hover:bg-gray-50"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                active ? "bg-brand-50 text-brand-700" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              )}>
                <Icon size={18} className={active ? "text-brand-600" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4 space-y-0.5 border-t border-gray-100 pt-3">
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all">
            <Settings size={18} /> Settings
          </Link>
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all">
            <LogOut size={18} /> Sign out
          </button>
          <div className="flex items-center gap-3 px-3 py-3 mt-2 rounded-xl bg-gray-50 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage, not an optimizable static asset
              <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 lg:pl-64">
        <main className="min-h-screen p-4 pt-[calc(4rem_+_env(safe-area-inset-top))] lg:p-8 max-w-7xl mx-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
