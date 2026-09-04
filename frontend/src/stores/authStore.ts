"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  initialize: () => Promise<() => void>;
  signIn: (email: string, password: string) => Promise<{ needsMfa: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>;
  clearAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  loading: true,

  initialize: async () => {
    const supabase = createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const needsMfa = aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
      const profile = needsMfa ? null : await fetchProfile();
      if (profile) {
        set({ user: profile, isAuthenticated: true, loading: false });
      } else {
        set({ loading: false });
      }
    } else {
      set({ loading: false });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          const profile = await fetchProfile();
          if (profile) set({ user: profile, isAuthenticated: true });
        } else if (event === "SIGNED_OUT") {
          set({ user: null, isAuthenticated: false });
        }
      }
    );

    return () => subscription.unsubscribe();
  },

  signIn: async (email, password) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const e = new Error(error.message) as Error & { response?: { data: { detail: string } } };
      e.response = { data: { detail: error.message } };
      throw e;
    }

    // If the account has TOTP enabled, the session Supabase issues here is
    // only "aal1" (password-only) — leave isAuthenticated false until the
    // /mfa-challenge page steps the session up to "aal2".
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
      return { needsMfa: true };
    }

    const profile = await fetchProfile();
    if (profile) set({ user: profile, isAuthenticated: true });
    return { needsMfa: false };
  },

  signUp: async (email, password, fullName) => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      const e = new Error(error.message) as Error & { response?: { data: { detail: string } } };
      e.response = { data: { detail: error.message } };
      throw e;
    }
    // Returns true when email confirmation is required (no session yet)
    return { needsConfirmation: !data.session };
  },

  clearAuth: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));

async function fetchProfile(): Promise<User | null> {
  try {
    const res = await fetch("/api/profile");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
