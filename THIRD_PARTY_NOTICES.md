# Credits and third-party components

## Included Dot Wave code

The mushroom renderer uses these Dot Wave Studio modules, adapted to ES module filenames: `dot-effects-dsp.mjs`, `dot-amp-tone.mjs`, `dot-studio-dsp.mjs`, `dot-collision-audio.mjs`, `dot-wave-export.mjs`, `dot-mushroom-dsp.mjs`, and `dot-mushroom-motion.mjs`.

The project owner authorized the copies included here for distribution under GPL-3.0-only. Attribution is retained in the source and mushroom guide. Other Dot Wave Studio code, downloads and branding outside this repository are not covered by this grant.

## Included Telephone World and Studio workspace

This repository also includes the project owner’s Bullshit Telephone World 2 narrative interface, the Dot Wave Studio 2.3 editor and their Doodleverse project bridge. The included project code is distributed under GPL-3.0-only with this repository. This does not change the separate rights to writing, drawings, sounds or projects imported or created by users.

## Runtime components

The desktop distribution contains project source, not a bundled Node.js installer. The Home Assistant Dockerfile refers to a pinned official Node.js image and installs Debian certificate authorities. Version 0.3b does not bundle or run Tailscale. Runtime components retain their own licenses and notices:

- [Node.js license and bundled notices](https://github.com/nodejs/node/blob/main/LICENSE)
- Debian package copyright files in `/usr/share/doc` inside a built image

GitHub Actions used for validation run outside the distributed app and retain their upstream licenses. No third-party service endorsement is implied.

## User-created content

Project-code licensing does not change ownership or licenses of users' writing, recipes, sounds or shared files. Creative Commons metadata is handled separately by the app. Buying a mushroom generator transfers its in-app earning rights, not copyright in its recipe or sound.

## Public garden contract

The public garden uses OpenZeppelin Contracts 5.6.1 ERC20 code under the MIT license. The exact Solidity dependency sources are included in `contracts/artifacts/compiler-input.json` (or `contract-source/artifacts/compiler-input.json` in desktop/Pi downloads), alongside project source and reproducible build instructions. The browser deployment artifact is generated from those sources. Compiler and EVM verification tools are development dependencies, pinned in the contract lockfile.

The MIT License (MIT)

Copyright (c) 2016-2026 Zeppelin Group Ltd

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:
The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Recipient wallet signature verification

The browser contains a pinned, unminified ethers 6.17.0 signature/encoding bundle, including Noble curve and hash primitives. These components retain their MIT licenses; full component versions, copyrights and license texts are in `keeper/public/recipient-crypto-notices.txt` (or `public/recipient-crypto-notices.txt` in desktop/Pi downloads). The bundle contains no wallet connection or provider API.

Corresponding dependency sources, build entry, pinned dependency lockfile and rebuild instructions are included in `crypto-vendor/` in the repository and Home Assistant source download, or `crypto-source/` in desktop/Pi downloads. `source-inputs.json` contains the contributing source modules and their preferred TypeScript sources where applicable. Rebuilding and checking the bundled output is a development operation; running the app needs no npm installation or CDN. Project integration code remains GPL-3.0-only.
