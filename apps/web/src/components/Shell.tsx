import { useQueryClient } from "@tanstack/react-query";
import { ChartNoAxesColumn, Inbox, LogOut, Plus, Search, Settings } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { api, type User } from "../api";
import { useReview } from "../hooks";
import { Mark } from "./bits";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const onPipeline = location === "/" || location.startsWith("/a/") || location === "/new";
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(params.get("q") ?? "");

  // Keep the box in sync when the URL changes elsewhere (back button, cleared filter).
  const urlQ = params.get("q") ?? "";
  useEffect(() => setQ(urlQ), [urlQ]);

  // Push the query into the URL shortly after typing stops.
  useEffect(() => {
    if (q === urlQ) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(onPipeline ? search : "");
      if (q) next.set("q", q);
      else next.delete("q");
      const qs = next.toString();
      navigate(`${onPipeline ? location : "/"}${qs ? `?${qs}` : ""}`, { replace: onPipeline });
    }, 180);
    return () => clearTimeout(t);
  }, [q, urlQ, search, location, onPipeline, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n") {
        e.preventDefault();
        navigate(`/new${search ? `?${search}` : ""}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, search]);

  const keep = search ? `?${search}` : "";
  const reviewCount = useReview().data?.length ?? 0;

  return (
    <>
      <header className="shell-bar">
        <div className="shell-bar-inner">
          <Link href="/" className="wordmark" aria-label="Applied, pipeline">
            <Mark />
            <span className="label">Applied</span>
          </Link>
          <nav className="shell-nav" aria-label="Main">
            <Link href={`/${keep}`} aria-current={onPipeline ? "page" : undefined}>
              Pipeline
            </Link>
            <Link href="/review" aria-current={location === "/review" ? "page" : undefined}>
              Review
              {reviewCount > 0 && <span className="nav-count num">{reviewCount}</span>}
            </Link>
            <Link href="/insights" aria-current={location === "/insights" ? "page" : undefined}>
              Insights
            </Link>
            <Link href="/settings" aria-current={location === "/settings" ? "page" : undefined}>
              Settings
            </Link>
          </nav>
          <search className="shell-search">
            <Search />
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQ("");
                  e.currentTarget.blur();
                }
              }}
              placeholder="Find an application"
              aria-label="Find an application by company or role"
            />
            <kbd>/</kbd>
          </search>
          <Link href={`/new${keep}`} className="btn btn-add">
            <Plus />
            <span className="label">Add application</span>
          </Link>
          <AccountMenu user={user} />
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}

function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
      >
        {initial}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">{user.email}</div>
          <Link href="/review" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Inbox />
            Review
          </Link>
          <Link
            href="/insights"
            className="menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <ChartNoAxesColumn />
            Insights
          </Link>
          <Link
            href="/settings"
            className="menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Settings />
            Settings
          </Link>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={async () => {
              await api.signOut();
              qc.clear();
              navigate("/sign-in");
            }}
          >
            <LogOut />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
