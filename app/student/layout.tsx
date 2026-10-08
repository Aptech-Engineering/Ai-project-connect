import Script from "next/script";

/**
 * Chrome fires `beforeinstallprompt` once, and often before React has mounted — miss
 * it and there is no way to offer the install at all. This catches it in the page
 * head and parks it on `window`, where the pass picks it up whenever it is ready.
 */
const CATCH_INSTALL = `
window.__apcInstall = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__apcInstall = e;
  window.dispatchEvent(new Event('apc-installable'));
});
`;

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script id="apc-catch-install" strategy="beforeInteractive">
        {CATCH_INSTALL}
      </Script>
      {children}
    </>
  );
}
