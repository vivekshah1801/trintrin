#!/bin/sh
# Installs trintrin into ~/.trintrin and puts a `trintrin` launcher on your PATH.
#
#   curl -fsSL https://raw.githubusercontent.com/vivekshah1801/trintrin/main/install.sh | sh
#
set -eu

REPO="vivekshah1801/trintrin"
BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/$REPO/$BRANCH"
INSTALL_DIR="$HOME/.trintrin"
BIN_DIR="$HOME/.local/bin"

fetch() {
    # $1 = file name in the repo root, $2 = local destination
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$RAW_BASE/$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$RAW_BASE/$1" -O "$2"
    else
        echo "error: need curl or wget to install trintrin" >&2
        exit 1
    fi
}

if ! command -v python3 >/dev/null 2>&1 && ! command -v uv >/dev/null 2>&1; then
    echo "error: need python3 or uv on PATH to run trintrin" >&2
    exit 1
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

echo "Fetching trintrin into $INSTALL_DIR ..."
fetch trintrin.py "$INSTALL_DIR/trintrin.py"
fetch trintrin.html "$INSTALL_DIR/trintrin.html"
chmod +x "$INSTALL_DIR/trintrin.py"

# A wrapper (rather than a symlink) so trintrin.py's own file-relative lookup
# of trintrin.html still works no matter where the launcher lives on PATH.
cat > "$BIN_DIR/trintrin" <<EOF
#!/bin/sh
if command -v uv >/dev/null 2>&1; then
    exec uv run "$INSTALL_DIR/trintrin.py" "\$@"
else
    exec python3 "$INSTALL_DIR/trintrin.py" "\$@"
fi
EOF
chmod +x "$BIN_DIR/trintrin"

echo "Installed -> $BIN_DIR/trintrin"

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
        echo ""
        echo "$BIN_DIR is not on your PATH. Add this to your shell profile (e.g. ~/.zshrc):"
        echo "  export PATH=\"$BIN_DIR:\$PATH\""
        ;;
esac

echo ""
echo "Port-forward Trino, then run: trintrin"
