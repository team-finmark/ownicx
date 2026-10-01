"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionState } from "@/app/actions";
import { completeFacebookSignup } from "@/app/whatsapp-actions";
import { safely, Toast } from "./forms";
import { Button } from "@/components/ui/button";

// Meta Embedded Signup: the manager signs in with Facebook, picks (or creates) their WhatsApp
// Business account and number, and Meta returns a code + the number's IDs to this page.

interface FBLoginResponse {
  authResponse?: { code?: string } | null;
}
interface FBSdk {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: FBLoginResponse) => void, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    FB?: FBSdk;
    fbAsyncInit?: () => void;
  }
}

let sdk: Promise<FBSdk> | null = null;
function loadSdk(appId: string): Promise<FBSdk> {
  sdk ??= new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve(window.FB!);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      sdk = null;
      reject(new Error("Couldn't load Facebook. Check your internet connection or ad blocker."));
    };
    document.body.appendChild(s);
  });
  return sdk;
}

export function FacebookConnect({ appId, configId, connected }: { appId: string; configId: string; connected: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [busy, setBusy] = useState(false);
  const ids = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      let host = "";
      try {
        host = new URL(e.origin).hostname; // origin can be "null" (sandboxed frames, extensions)
      } catch {
        return;
      }
      if (!/(^|\.)facebook\.com$/.test(host)) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          ids.current = { phoneNumberId: data.data?.phone_number_id, wabaId: data.data?.waba_id };
        } else if (data.event === "CANCEL") {
          setState({ ok: false, message: `Facebook setup was closed${data.data?.current_step ? ` at "${data.data.current_step}"` : ""}. Nothing was changed.` });
          setBusy(false);
        }
      } catch {
        /* not a signup message */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const start = async () => {
    setBusy(true);
    setState(null);
    try {
      const FB = await loadSdk(appId);
      FB.login(
        (resp) => {
          const code = resp.authResponse?.code;
          if (!code) {
            setBusy(false);
            setState({ ok: false, message: "Facebook sign-in was cancelled." });
            return;
          }
          // The number's IDs arrive by postMessage just before/after this callback.
          void (async () => {
            for (let i = 0; i < 20 && !ids.current.phoneNumberId; i++) await new Promise((r) => setTimeout(r, 250));
            const r = await safely(() => completeFacebookSignup({ code, phoneNumberId: ids.current.phoneNumberId ?? "", wabaId: ids.current.wabaId ?? "" }));
            setState(r);
            setBusy(false);
          })();
        },
        { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } },
      );
    } catch (e) {
      setBusy(false);
      setState({ ok: false, message: e instanceof Error ? e.message : "Couldn't start Facebook sign-in" });
    }
  };

  return (
    <>
      <Button type="button" size="lg" onClick={start} disabled={busy} className="h-12 gap-2 bg-[#1877F2] px-5 text-base text-white hover:bg-[#166fe5]">
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
        </svg>
        {busy ? "Waiting for Facebook…" : connected ? "Reconnect with Facebook" : "Continue with Facebook"}
      </Button>
      {state?.ok ? (
        // Success stays on screen: it contains the one-time two-step PIN.
        <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{state.message}</p>
      ) : (
        <Toast state={state} />
      )}
    </>
  );
}
