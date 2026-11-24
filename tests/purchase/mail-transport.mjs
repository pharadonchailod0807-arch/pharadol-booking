// Loaded only by the smoke test child process. Resend requests cannot reach the internet.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  if (String(input) === "https://api.resend.com/emails") {
    const stub = new URL("/fixture/resend", process.env.PURCHASE_SMOKE_STUB);
    return nativeFetch(stub, options);
  }
  return nativeFetch(input, options);
};
