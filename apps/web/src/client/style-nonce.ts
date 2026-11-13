declare let __webpack_nonce__: string | undefined;

/**
 * Radix dialogs lock page scroll with a `<style>` element (react-style-singleton), which the app
 * CSP allows only with this page's nonce. Webpack's `__webpack_nonce__` is where that library
 * looks for it; the nonce comes from Next.js's own bootstrap scripts.
 */
export function adoptStyleNonce(): void {
  const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
  if (nonce) __webpack_nonce__ = nonce;
}
