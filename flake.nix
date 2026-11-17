{
  description = "Unicode Map — an interactive, zoomable map of the Unicode code space";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # The Unicode version everything is built against. Bump this (and the hashes) to upgrade.
      unicodeVersion = "18.0.0";
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          base = "https://www.unicode.org/Public/${unicodeVersion}";
          python = pkgs.python3.withPackages (ps: [ ps.fonttools ]);
        in
        rec {
          # Unicode Character Database (UnicodeData.txt, Blocks.txt, NamesList.txt, extracted/, emoji/ …)
          ucd = pkgs.fetchzip {
            name = "ucd-${unicodeVersion}";
            url = "${base}/ucd/UCD.zip";
            stripRoot = false;
            hash = "sha256-xD3LVehqP02v8fsF01BmogKljnjQxnfdc6iqLTcu7FQ=";
          };

          # Unihan database (CJK readings, definitions, radical/stroke counts …)
          unihan = pkgs.fetchzip {
            name = "unihan-${unicodeVersion}";
            url = "${base}/ucd/Unihan.zip";
            stripRoot = false;
            hash = "sha256-sTZYYvN70W39lNKQKnczFO4rI0BwtxbIaCeyO7pYSy0=";
          };

          # Unicode CLDR: script metadata, and language and territory data, for "About" cards.
          # Released separately from the UCD; this is the latest release.
          cldr = pkgs.fetchzip {
            name = "cldr-common-49";
            url = "https://unicode.org/Public/cldr/49/cldr-common-49.zip";
            stripRoot = false;
            hash = "sha256-s0nDPUMwP/DgeL7PdeKyFASAU8hTHw644qPWrl+F6zw=";
          };

          # UTS #39 confusables
          confusables = pkgs.fetchurl {
            name = "confusables-${unicodeVersion}.txt";
            url = "${base}/security/confusables.txt";
            hash = "sha256-btPulnyd/fZnfVY8mYUYL7xQou+31gWc1XsuLOGPW5I=";
          };

          # Kaiyuan Small Seal (OFL-1.1): covers the Unicode 18 Seal block. Not released yet, so build
          # it from the traced glyphs at a pinned commit. Work in progress: glyphs are unreviewed.
          kaiyuan-small-seal = pkgs.stdenvNoCC.mkDerivation {
            pname = "kaiyuan-small-seal";
            version = "0-unstable-2026-09-22";
            src = pkgs.fetchFromGitHub {
              owner = "frankslin";
              repo = "kaiyuan-small-seal-font";
              rev = "97433695858330ec9fdb7de9c4604da2f635eba6";
              hash = "sha256-qwM8SVPZds++b4mQSR26Eup5MdVZOdCIyCF3nz14j8c=";
            };
            nativeBuildInputs = [ python ];
            buildPhase = ''
              python3 scripts/build_font.py --no-woff2
            '';
            installPhase = ''
              mkdir -p $out/share/fonts/truetype
              cp build/*.ttf $out/share/fonts/truetype/
            '';
          };

          # UniHieroglyphica (OFL-1.1), by Michel Suignard: the full Unicode set of Egyptian
          # hieroglyphs, including the 3,995 signs of Extended-A (Unicode 16). Not in nixpkgs.
          unihieroglyphica = pkgs.stdenvNoCC.mkDerivation {
            pname = "unihieroglyphica";
            version = "0-unstable-2026-07-23";
            src = pkgs.fetchurl {
              url = "https://raw.githubusercontent.com/thesaurus-linguae-aegyptiae/unihieroglyphica/9375eba4e2b626658e57e3a526118b8225c0581e/font_files/UniHieroglyphica.ttf";
              hash = "sha256-rWC7L0aWl4N7VWOI1HtQCiHYZjcKSai+dwsgYQiq9mQ=";
            };
            dontUnpack = true;
            installPhase = ''
              install -Dm644 $src $out/share/fonts/truetype/UniHieroglyphica.ttf
            '';
          };

          # Web-servable font set: one regular face per Noto family, single faces extracted
          # from the CJK collections, Noto Color Emoji, and Last Resort as the final fallback.
          # Also writes manifest.json with each font's cmap coverage.
          fonts =
            pkgs.runCommand "unicode-map-fonts"
              {
                nativeBuildInputs = [ python ];
                fontDirs = [
                  pkgs.noto-fonts
                  pkgs.noto-fonts-cjk-sans
                  pkgs.noto-fonts-color-emoji
                  # Gap fillers for what Noto doesn't cover (see public/data/coverage.json):
                  pkgs.jigmo # CJK Unified Ideographs Extensions B–J
                  pkgs.kreative-square # Symbols for Legacy Computing (Supplement)
                  kaiyuan-small-seal # Seal
                  unihieroglyphica # Egyptian Hieroglyphs Extended-A
                  "${pkgs.unifont}/share/fonts/opentype/unifont" # pixel fallback for the rest
                  pkgs.last-resort
                ];
              }
              ''
                python3 ${./nix/build-fonts.py} "$out" $fontDirs
                # Interface fonts (not part of the glyph coverage set)
                # Noto Color Emoji's vector (COLRv1) build, from the same source: Firefox and
                # Chrome draw it, while the CBDT bitmaps above don't render in Firefox on macOS.
                mkdir -p $out/emoji
                cp ${pkgs.noto-fonts-color-emoji.src}/fonts/Noto-COLRv1.ttf $out/emoji/
                mkdir -p $out/ui
                cp ${pkgs.inter}/share/fonts/truetype/InterVariable.ttf $out/ui/Inter.ttf
                cp "${pkgs.jetbrains-mono}/share/fonts/truetype/JetBrainsMono[wght].ttf" $out/ui/JetBrainsMono.ttf
              '';

          # All the Unicode inputs in one place, for convenience.
          unicode-data = pkgs.linkFarm "unicode-data-${unicodeVersion}" {
            "ucd" = ucd;
            "unihan" = unihan;
            "confusables.txt" = confusables;
            "cldr" = cldr;
          };

          default = unicode-data;
        }
      );

      devShells = forAllSystems (
        pkgs:
        let
          p = self.packages.${pkgs.stdenv.hostPlatform.system};
          node = [
            pkgs.nodejs_24
            # nixpkgs' pnpm bundles its own Node; build it on the shell's Node major so there is one Node here.
            (pkgs.pnpm_11.override { nodejs-slim = pkgs.nodejs-slim_24; })
          ];
          # Corepack ships inside Node and will download package managers on demand; keep it inert so
          # pnpm always comes from the Nix store above.
          corepackOff = {
            COREPACK_ENABLE_STRICT = "0";
            COREPACK_ENABLE_AUTO_PIN = "0";
            COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
            COREPACK_ENABLE_NETWORK = "0";
          };
        in
        {
          default = pkgs.mkShell (
            corepackOff
            // {
              packages = node ++ [
                (pkgs.python3.withPackages (ps: [ ps.fonttools ]))
                pkgs.go-task # `task`: the menu of what to run (Taskfile.yml)
              ];
              UNICODE_VERSION = unicodeVersion;
              UCD_DIR = p.ucd;
              UNIHAN_DIR = p.unihan;
              CONFUSABLES = p.confusables;
              CLDR_DIR = p.cldr;
              FONTS_DIR = p.fonts;
              shellHook = ''
                echo "unicode-map dev shell — Unicode ${unicodeVersion}"
                echo "  task --list    # what can be run"
              '';
            }
          );

          # What `pnpm check` needs and nothing else: no fonts or Unicode data to build.
          ci = pkgs.mkShell (corepackOff // { packages = node; });
        }
      );

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
