"""Disk storage management for saved queries across different operating systems."""

import json
import os
import sys


def get_data_dir():
    """Returns the OS-appropriate user data directory for trintrin."""
    # 1. Custom / standard XDG override
    xdg_data = os.environ.get('XDG_DATA_HOME')
    if xdg_data:
        return os.path.join(xdg_data, 'trintrin')

    # 2. Windows: %APPDATA%\trintrin or %LOCALAPPDATA%\trintrin
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA') or os.environ.get('LOCALAPPDATA')
        if appdata:
            return os.path.join(appdata, 'trintrin')
        return os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'trintrin')

    # 3. macOS: ~/Library/Application Support/trintrin (or ~/.local/share/trintrin if already created)
    if sys.platform == 'darwin':
        local_share = os.path.join(os.path.expanduser('~/.local/share'), 'trintrin')
        if os.path.exists(local_share):
            return local_share
        return os.path.join(os.path.expanduser('~/Library/Application Support'), 'trintrin')

    # 4. Linux and other Unix: ~/.local/share/trintrin
    return os.path.join(os.path.expanduser('~/.local/share'), 'trintrin')


SAVED_QUERIES_FILE = os.path.join(get_data_dir(), 'saved_queries.json')


def get_candidate_query_files():
    """Returns all candidate paths where saved queries could reside across OS conventions."""
    paths = [SAVED_QUERIES_FILE]
    for alt in (
        os.path.join(os.path.expanduser('~/.local/share'), 'trintrin', 'saved_queries.json'),
        os.path.join(os.path.expanduser('~/Library/Application Support'), 'trintrin', 'saved_queries.json'),
    ):
        if alt not in paths:
            paths.append(alt)
    return paths


def load_saved_queries():
    for path in get_candidate_query_files():
        if os.path.isfile(path):
            try:
                with open(path, 'r', encoding='utf-8') as handle:
                    data = json.load(handle)
                    if isinstance(data, list):
                        return data
            except Exception as error:
                sys.stderr.write(f"Failed to read saved queries from {path}: {error}\n")
    return []


def store_saved_queries(queries):
    path = SAVED_QUERIES_FILE
    parent = os.path.dirname(path)
    os.makedirs(parent, exist_ok=True)
    tmp_path = path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as handle:
        json.dump(queries, handle, indent=2, ensure_ascii=False)
        handle.write('\n')
    os.replace(tmp_path, path)
