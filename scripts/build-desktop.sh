#!/usr/bin/env bash
set -euo pipefail

# Story Desktop Build Script
# Usage: ./scripts/build-desktop.sh [options]
#   --skip-native     Skip Rust native build
#   --skip-web        Skip web renderer build (use existing web-static)
#   --skip-install    Skip all yarn install steps
#   --platform NAME   Target platform: darwin (default), linux, win32
#   --arch NAME       Target arch: x64 (default), arm64
#   --package-only    Only run packaging (assumes build is done)

APP_NAME="Story"
BUILD_TYPE="${BUILD_TYPE:-canary}"
PLATFORM="${PLATFORM:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
ARCH="${ARCH:-$(uname -m)}"

case "$PLATFORM" in
  Darwin) PLATFORM="darwin" ;;
  Linux) PLATFORM="linux" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="win32" ;;
esac
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

SKIP_NATIVE=false
SKIP_WEB=false
SKIP_INSTALL=false
PACKAGE_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-native)  SKIP_NATIVE=true; shift ;;
    --skip-web)     SKIP_WEB=true; shift ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --package-only) PACKAGE_ONLY=true; shift ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --arch) ARCH="$2"; shift 2 ;;
    --help)
      echo "Usage: $0 [--skip-native] [--skip-web] [--skip-install] [--package-only]"
      echo "           [--platform darwin|linux|win32] [--arch x64|arm64]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[build]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="packages/frontend/apps/electron"
cd "$PROJECT_ROOT"

log "Building $APP_NAME Desktop ($BUILD_TYPE) for $PLATFORM/$ARCH"

# ─── Check prerequisites ───
if ! command -v git &>/dev/null; then
  err "git is not installed. Story requires git for document storage."
fi
log "git found: $(git --version)"

# ─── Package only ───
if [ "$PACKAGE_ONLY" = true ]; then
  log "Package-only mode"
  BUILD_TYPE="$BUILD_TYPE" SKIP_WEB_BUILD=1 HOIST_NODE_MODULES=1 \
    yarn affine "@affine/electron" make "--platform=$PLATFORM" "--arch=$ARCH"
  log "Done!"
  exit 0
fi

# ─── Phase 1: Install dependencies (default config) ───
yarn config set nmMode hardlinks-local 2>/dev/null || true
yarn config set nmHoistingLimits none 2>/dev/null || true

if [ "$SKIP_INSTALL" = false ]; then
  if [ ! -d "node_modules" ]; then
    log "Phase 1: Installing dependencies"
    yarn install
  else
    log "Phase 1: node_modules exists, skipping full install"
  fi
else
  warn "Phase 1: Skipping install (--skip-install)"
fi

# ─── Phase 2: Build native modules ───
if [ "$SKIP_NATIVE" = false ]; then
  log "Phase 2: Building native modules (Rust)"
  yarn affine "@affine/native" build
else
  warn "Phase 2: Skipping native build"
fi

# ─── Phase 3: Create electron-specific node_modules ───
log "Phase 3: Setting up electron node_modules (workspaces focus)"

rm -rf "$ELECTRON_DIR/node_modules"

yarn config set nmMode classic 2>/dev/null || true
yarn config set nmHoistingLimits workspaces 2>/dev/null || true

mkdir -p "$ELECTRON_DIR/node_modules"
ln -s "$PROJECT_ROOT/node_modules/electron" "$ELECTRON_DIR/node_modules/electron"

yarn workspaces focus "@affine/electron" "@affine/monorepo" "@affine/nbstore" "@toeverything/infra"

yarn config set nmMode hardlinks-local 2>/dev/null || true
yarn config set nmHoistingLimits none 2>/dev/null || true

# ─── Phase 4: Build web + electron layers ───
log "Phase 4: Building web assets and electron layers (production)"
if [ "$SKIP_WEB" = false ]; then
  NODE_ENV=production BUILD_TYPE="$BUILD_TYPE" yarn affine "@affine/electron" generate-assets
else
  warn "Phase 4: Skipping web build, only building layers"
  NODE_ENV=production BUILD_TYPE="$BUILD_TYPE" yarn affine "@affine/electron" build
fi

# ─── Phase 5: Package / Make ───
log "Phase 5: Packaging $APP_NAME desktop app ($PLATFORM/$ARCH)"
if [ "$PLATFORM" = "win32" ]; then
  BUILD_TYPE="$BUILD_TYPE" SKIP_WEB_BUILD=1 HOIST_NODE_MODULES=1 \
    yarn affine "@affine/electron" package "--platform=$PLATFORM" "--arch=$ARCH"
else
  BUILD_TYPE="$BUILD_TYPE" SKIP_WEB_BUILD=1 HOIST_NODE_MODULES=1 \
    yarn affine "@affine/electron" make "--platform=$PLATFORM" "--arch=$ARCH"
fi

# ─── Done ───
OUT_DIR="$ELECTRON_DIR/out/$BUILD_TYPE"
log "Build complete!"
log "Output: $OUT_DIR/"

if [ "$PLATFORM" = "darwin" ]; then
  APP_PATH="$OUT_DIR/$APP_NAME-${BUILD_TYPE}-darwin-${ARCH}/$APP_NAME-${BUILD_TYPE}.app"
  DMG_PATH=$(find "$OUT_DIR/make" -name "*.dmg" 2>/dev/null | head -1)
  [ -d "$APP_PATH" ] && log "App:    $APP_PATH"
  [ -n "$DMG_PATH" ] && [ -f "$DMG_PATH" ] && log "DMG:    $DMG_PATH"
fi

log ""
log "$APP_NAME Desktop build finished successfully!"
