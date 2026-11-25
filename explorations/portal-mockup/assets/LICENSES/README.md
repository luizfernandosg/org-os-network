# Font licences

The fonts in `assets/` are not under this repository's MIT licence. They are under the SIL Open
Font License 1.1, and each family's licence text, with its copyright line, is in this folder.

| Files | Family | From | Licence |
|---|---|---|---|
| `fraunces-*.woff2` (4) | Fraunces | npm `@fontsource-variable/fraunces` 5.3.0, from [undercasetype/Fraunces](https://github.com/undercasetype/Fraunces) | [OFL-Fraunces.txt](OFL-Fraunces.txt) |
| `geist-latin*.woff2` (2) | Geist | npm `@fontsource-variable/geist` 5.3.0, from [vercel/geist-font](https://github.com/vercel/geist-font) | [OFL-Geist.txt](OFL-Geist.txt) |
| `geist-mono-*.woff2` (2) | Geist Mono | npm `@fontsource-variable/geist-mono` 5.3.0, from [vercel/geist-font](https://github.com/vercel/geist-font) | [OFL-Geist-Mono.txt](OFL-Geist-Mono.txt) |

The files came through the org-os Hub's build, which vendors them from those packages. Their
sha256 sums match the ones the Hub records for them. The extra part of each file name (for
example `-CFFu7zhK`) is the build's hash, not a change to the font.

The three licence texts are the `LICENSE` files shipped in those package versions. The upstream
repositories' own `OFL.txt` files carry the same licence.
