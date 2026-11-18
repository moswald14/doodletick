# Jazz titles, payment and new beats

The Jazz room has a **Name this song** button. A listener reviews and confirms a direct transfer of about **$0.02 USD worth of original PEPE on Ethereum** to the creator. After three confirmations, the Keeper asks OpenAI for an original title and a quiet, one-bar drum groove. The groove joins at a bar boundary, follows the drum mixer and returns to the ordinary arrangement at the next set. A saved beat can also be applied explicitly to a later set. The paid PEPE flow is unchanged by the new band controls and Dot Wave player voices.

Ethereum charges its own fee in ETH, paid by the listener. That fee can exceed the PEPE payment. This is a direct token transfer; no unlimited approval, custody, swap, bridge or automatic withdrawal is used. The connected wallet must hold PEPE and enough ETH. It shows the final fee and requires the listener’s confirmation.

## Owner setup

Naming is **off by default**, including this development update. Ordinary Jazz playback works without any account or payment. Do not turn naming on until the owner’s OpenAI account has credit and the selected model works.

In Home Assistant, open Doodle Tick’s Configuration and set:

- `jazz_recipient`: the creator’s public Ethereum receiving address. The requested address is prefilled.
- `jazz_openai_api_key`: the owner’s OpenAI API key, entered into Home Assistant’s password field. Never put it in Jazz, a browser script, a chat message or a public repository.
- `jazz_daily_limit`: the maximum number of generation attempts per UTC day, including retries; default 30. Each new quote reserves room for up to three attempts.
- `jazz_enabled`: turn on after the account is connected, then restart the app.

In Jazz, **Check OpenAI connection** checks access to the naming model without
requesting a payment or a generated song. If the check reports a rejected key,
replace it directly in Home Assistant's Jazz password field.

For desktop/Pi, supply these server environment variables through the existing service manager: `OPENAI_API_KEY`, `DOODLETICK_JAZZ_ENABLED=true`, `DOODLETICK_JAZZ_NETWORK=ethereum`, `DOODLETICK_JAZZ_RECIPIENT`, and optionally `DOODLETICK_JAZZ_DAILY_LIMIT` (default 30). `DOODLETICK_JAZZ_RPC_URL` can select an owner-trusted HTTPS Ethereum RPC; the default is PublicNode. Environment files are not loaded automatically or included in release downloads.

The server checks Ethereum’s chain ID, the token’s decimals, current public PEPE/USD pricing and access to the OpenAI model before issuing a quote. This preflight cannot guarantee the account will retain credit or the network will remain available afterward. There is no account key in the public configuration endpoint. Home Assistant ingress keeps its existing authentication and request protection; this feature does not make the Keeper public to unauthenticated listeners.

## Receipts and recovery

The exact amount is fixed for five minutes. Confirm promptly; it must be mined within that window, while confirmations can arrive afterward. The quote uses upward decimal rounding plus a random, economically negligible fraction of a PEPE token to identify the invoice. Always send the exact displayed amount with the button. The server verifies the chain, successful receipt, canonical token contract, sender, creator, transfer calldata, exact amount, inclusion time/block and three confirmations. Each transaction and exact invoice amount is reserved durably so another request cannot redeem a visible transaction first.

The browser saves a private recovery receipt before opening the wallet. **Save receipt** downloads a copy; **Restore receipt** recovers it. Keep that file private: its random capability authorizes access to that request. It contains no wallet private key or OpenAI key. If a wallet returns no hash, the page asks for the transaction hash and never automatically sends again.

If OpenAI fails, **Retry generation** reuses the paid receipt with no additional PEPE transfer. There are at most three bounded API attempts for each payment. An interrupted attempt is not retried automatically, because it may already have incurred an API charge. After three failures, or for a payment mined after expiry, keep the receipt and contact the Keeper owner. There is no automatic refund or withdrawal authority over the creator’s wallet. Three confirmations reduce reorganization risk; they do not provide Ethereum finality.

Server payment and generation records live in the private `jazz-naming/jazz-naming.json` file under the Keeper’s data directory. Do not delete it: it prevents replay and recovers paid jobs. Writes use a private, synced temporary file and atomic replacement. Corruption or persistence failure turns naming off without taking down the rest of the Keeper. The store stops accepting new quotes at 5,000 records instead of silently discarding spent transactions. Include these records and the private Home Assistant options in the existing cold-backup process; never publish them.

## Music and privacy

OpenAI receives a bounded musical summary: the audible set's seed, style, tempo, swing, key, bar/chorus, chord symbols, progression, phrase role and a few performed melody notes. The selected beats per bar, phrase length and beat-only state travel with that summary. Beat-only requests can have no melody notes. No recording, microphone audio, Dot Wave voice recipe, wallet password, payer address or API key enters that summary.

The result is text and a validated 16-step percussion pattern, never executable code. The renderer fits those steps into the selected two-to-seven-beat bar. Swing styles retain their timing grid; straight genres keep their straight pulse. Phrase length follows the genre or the chosen 4, 8, 16 or 32 bars, preserving the call, varied repeat, answer and cadence approach. Key suggestions and all ordinary arrangement controls work without a naming payment or model call.

A successfully completed naming result also reinforces its musical progression in the Keeper's separate band preference memory. A successfully saved **I dig this!** passage does the same without payment. Feedback is deduplicated by the completed request or saved passage. It weights future local progression choices; it does not retrain the OpenAI model, rewrite signed keepsakes or modify payment records. **Bring back progressions I like** controls whether the band revisits these favorites. A preference-storage error leaves a completed paid result and existing recordings available. Read [the Jazz guide](JAZZ.md#progressions-you-like) for storage and limits.

The model is `gpt-6-luna`, limited to 1,600 output tokens, with no tools and no stored OpenAI response. The owner pays OpenAI’s API bill separately from the PEPE received. Server limits bound attempts; they do not represent a dollar spending limit in the OpenAI account.

Sources: [PEPE network and contract](https://www.coinbase.com/price/pepe), [Ethereum fees](https://ethereum.org/developers/docs/gas/), [Coinbase spot prices](https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [model details and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna).

Account access, release installation and audible output require their own checks. Selecting an account-setup option alone does not establish that a key was created or saved, or that a funded model request succeeded. Simulated payment tests do not establish a real-money purchase, funded API result or physical Home Assistant installation. Naming stays unavailable until the owner's connection and server configuration pass their checks.
