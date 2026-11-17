# Server Jazz streaming dependencies

This optional package adds native audio transport only when the owner starts the server radio. The application supplies its own synthesized PCM. It does not open a microphone, camera, display, browser profile or listening device.

The application adapter is GPL-3.0-only. It evaluates the existing local VDO.Ninja SDK 1.6.2, including the documented Doodle Jazz interoperability patch, in a separate compatibility context. That SDK retains its MPL-2.0 header, full source and existing license in `../public/`. No second SDK distribution is installed from npm.

## Exact dependency versions

`package-lock.json` records npm tarball URLs and SHA-512 integrity for every dependency, including each platform-specific optional binary. Keep the lockfile when installing or building an image.

| Package | Version | Upstream license |
| --- | --- | --- |
| `@roamhq/wrtc` | 0.10.0 | BSD-2-Clause; native WebRTC component notices also apply |
| `@roamhq/wrtc-linux-x64` | 0.10.0 | Same native distribution notices |
| `@roamhq/wrtc-linux-arm64` | 0.10.0 | Same native distribution notices |
| Other platform-specific `@roamhq/wrtc-*` optional packages | 0.10.0 | Same native distribution notices |
| `domexception` | 4.0.0 | MIT |
| `webidl-conversions` | 7.0.0 | BSD-2-Clause |

The native module is published by the [WonderInventions/node-webrtc project](https://github.com/WonderInventions/node-webrtc). The wrapper's npm metadata records source revision `75f1f55642d803ee558abd7f99b1915598ad21a0`; the Linux x64 and arm64 npm packages record revisions `dff2f810a00ec24d9613a945d26607cf3679a2b6` and `50b491c746e6c7cca3253bbd803f1ae5a6479f46`, respectively.

## License copies

- `licenses/node-webrtc-LICENSE.md` preserves the wrapper copyright and license.
- `licenses/node-webrtc-THIRD_PARTY_LICENSES.md` preserves the complete WebRTC/native component notices referenced by that license, including BoringSSL/OpenSSL and codec notices. It was fetched from the wrapper's exact source revision above; its SHA-256 is `b55125b08dbff045ae0eba81b03dcfb98416b9154c1402fc9da189eae69ac4a1`.
- `licenses/domexception-LICENSE.txt` and `licenses/webidl-conversions-LICENSE.md` preserve the remaining dependency licenses.

Retain this file and all license copies with redistributed server runtime materials. Native binaries and their component terms are separate from the application's license; the BSD wrapper label alone does not describe every embedded component.

## Reproducible installation

From this directory, using Node.js 24 on a supported platform:

```sh
npm ci --omit=dev --ignore-scripts --include=optional --no-audit --no-fund
```

The package uses prebuilt, platform-filtered optional binary dependencies. Package lifecycle scripts are disabled. Do not omit optional dependencies: the matching native module is required for audio. Keep `node_modules` out of source archives and install from the lockfile in the target image.

Linux images use glibc, such as the existing Debian Bookworm Node image. The upstream package includes Linux x64 and arm64 archives and targets N-API v3. Its README does not claim a verified Node.js 24/Linux arm64 runtime matrix; an archive's presence is not an image-load or audio-delivery test. Verify each released image architecture separately.

The transport consumes exactly 960 interleaved signed 16-bit samples per call: 480 stereo frames at 48,000 Hz, representing 10 ms. The calling radio engine supplies the pacing. Signaling advertisement and a connected data peer are reported separately from increasing outbound audio RTP counters.
