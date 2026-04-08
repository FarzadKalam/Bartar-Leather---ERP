import { AuthBindings } from "@refinedev/core";
import { supabase } from "./supabaseClient";

const isNetworkAuthError = (error: unknown): boolean => {
  const message = String((error as any)?.message || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("err_connection_reset") ||
    message.includes("err_internet_disconnected") ||
    message.includes("err_network_changed")
  );
};

const clearSupabaseStoredSession = () => {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.localStorage);
    keys
      .filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore localStorage access issues
  }
};

export const authProvider: AuthBindings = {
  login: async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message: error.message,
        },
      };
    }

    return {
      success: true,
      redirectTo: "/",
    };
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return {
        success: false,
        error: {
          name: "LogoutError",
          message: error.message,
        },
      };
    }
    return {
      success: true,
      redirectTo: "/login",
    };
  },
  check: async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!error && session) {
        return {
          authenticated: true,
        };
      }

      if (error && isNetworkAuthError(error)) {
        clearSupabaseStoredSession();
      }
    } catch (error) {
      if (isNetworkAuthError(error)) {
        clearSupabaseStoredSession();
      }
    }

    return {
      authenticated: false,
      redirectTo: "/login",
    };
  },
  getPermissions: async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      return data.user.role;
    }
    return null;
  },
  getIdentity: async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      return {
        ...data.user,
        name: data.user.user_metadata?.full_name || data.user.email,
        avatar: data.user.user_metadata?.avatar_url,
      };
    }
    return null;
  },
  onError: async (error) => {
    console.error(error);
    return { error };
  },
};
