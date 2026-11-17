# Doodleverse Windows GPU miner

This portable package includes Doodleverse Core, Keeper, the Scrypt WebGPU miner,
the native site wallet and its matching Node.js runtime. No system-wide install,
administrator access, CPU mining service or startup download is required.

1. Extract the whole ZIP into a folder you control. Keep its source and licenses.
2. Double-click **Start-Doodleverse.cmd**. Leave its window open.
3. In the browser, create or import your encrypted native wallet, or paste a
   receiving address. A receiving address is all mining requires.
4. Press the red **MINE NOW** button. **Keep mining** submits found blocks and
   gets fresh work until you stop. Hiding the page pauses GPU mining.
5. Use **Stop-Doodleverse.cmd** or Ctrl+C in the launcher window to stop services.

The GPU miner uses Chrome's hardware WebGPU support. Core validates blocks and
transactions; its node executable is not the GPU miner. Eco and Balanced change
GPU batch size, while Scrypt 1024/1/1 remains the network algorithm. The miner
never silently starts CPU searching if the GPU is unavailable.

The local page is `http://127.0.0.1:4329/scrypt.html`. This explicit loopback
address is a browser secure context; no public HTTP wallet endpoint is opened.
The node control port binds only to loopback, and this launcher opens no incoming
peer port or firewall rule. Saved node and Keeper data live separately under
`%LOCALAPPDATA%\Doodleverse`, so replacing an extracted package preserves them.
Keep encrypted browser-wallet backups separately: changing browser/profile or
site address does not move browser storage. No wallet key is stored in Core.

`miner-settings.json` contains only the selected network and explicit peers.
Peers must be IP:port entries, for example `192.0.2.10:38474` (documentation only),
or bracketed IPv6 with a port. There are no inherited Pepecoin seeds. Only choose
the live network if this package's chain manifest enables it and your peers use
the exact same published genesis and founder destination. Regtest coins are
disposable tests and have no monetary value. Mainnet cannot be enabled by editing
the settings file when the bundled manifest and executable keep it disabled.

The app checks all packaged program files against its manifest at startup.
The editable settings file is validated separately. `SHA256SUMS` checks the
downloaded ZIP; retain it with the archive. The package includes the complete
fork source, patch and dependencies, Keeper source and third-party notices.
Node's official checksum signature and published signing key are retained under
`provenance/node/`. The pinned runtime and its upstream sources are described in
`provenance/node-runtime.json`.

For a disposable service check, run `runtime\node.exe launcher.mjs --check`.
That checks the package files, native Core and Keeper connection, then removes
its own temporary data. It does not open a browser, mine or send coins, and does
not establish physical GPU performance. Use the browser's Check GPU control for
the hardware check.
