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

# Put $BIN_DIR on PATH by appending to the rc file of the user's login shell.
# Set TRINTRIN_NO_MODIFY_PATH=1 to skip this and just print the instructions.
MARKER="# Added by the trintrin installer"

profile_for_shell() {
    case "$1" in
        zsh)  echo "${ZDOTDIR:-$HOME}/.zshrc" ;;
        bash)
            # macOS Terminal opens login shells, which read ~/.bash_profile, not ~/.bashrc.
            if [ "$(uname -s)" = "Darwin" ]; then echo "$HOME/.bash_profile"; else echo "$HOME/.bashrc"; fi ;;
        fish) echo "${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish" ;;
        tcsh) echo "$HOME/.tcshrc" ;;
        csh)  echo "$HOME/.cshrc" ;;
        ksh|mksh) echo "$HOME/.kshrc" ;;
        sh|dash|ash) echo "$HOME/.profile" ;;
        *)    echo "" ;;
    esac
}

path_line_for_shell() {
    case "$1" in
        fish)     echo "fish_add_path \"$BIN_DIR\"" ;;
        tcsh|csh) echo "setenv PATH \"$BIN_DIR:\$PATH\"" ;;
        *)        echo "export PATH=\"$BIN_DIR:\$PATH\"" ;;
    esac
}

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
        SHELL_NAME=$(basename "${SHELL:-sh}")
        PROFILE=$(profile_for_shell "$SHELL_NAME")
        PATH_LINE=$(path_line_for_shell "$SHELL_NAME")

        echo ""
        if [ -z "$PROFILE" ] || [ "${TRINTRIN_NO_MODIFY_PATH:-0}" = "1" ]; then
            echo "$BIN_DIR is not on your PATH. Add this to your shell's startup file:"
            echo "  $PATH_LINE"
        elif [ -f "$PROFILE" ] && grep -qF "$MARKER" "$PROFILE"; then
            echo "$BIN_DIR is already set up in $PROFILE; open a new terminal to pick it up."
        else
            mkdir -p "$(dirname "$PROFILE")"
            printf '\n%s\n%s\n' "$MARKER" "$PATH_LINE" >> "$PROFILE"
            echo "Added $BIN_DIR to PATH in $PROFILE ($SHELL_NAME)."
            echo "Open a new terminal, or run: source $PROFILE"
        fi
        ;;
esac

echo ""
echo "Port-forward Trino, then run: trintrin"
