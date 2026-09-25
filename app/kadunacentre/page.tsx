"use client";

import { useEffect } from "react";

/**
 * /kadunacentre → the Aptech Kaduna website.
 *
 * On the live server Apache redirects first (see public/.htaccess), so this page is
 * rarely reached. It exists so the shortcut still works if the rewrite rules are off,
 * on a host without mod_rewrite, and in local development — and so anyone who lands
 * here with JavaScript disabled still gets a link to follow.
 */
const KADUNA_SITE = "https://aptechwebsite.vercel.app/";

export default function KadunaCentreRedirect() {
  useEffect(() => {
    // replace(), not assign(): Back should return to where they came from, not here.
    window.location.replace(KADUNA_SITE);
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-navy-950 px-4 text-center">
      <div>
        <p className="font-display text-lg font-bold text-white">Taking you to Aptech Kaduna…</p>
        <p className="mt-2 text-sm text-white/60">
          If nothing happens,{" "}
          <a href={KADUNA_SITE} className="font-bold text-brand underline">
            open the Kaduna centre site
          </a>
          .
        </p>
      </div>
    </main>
  );
}
