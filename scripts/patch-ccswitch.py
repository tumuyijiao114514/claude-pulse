#!/usr/bin/env python3
"""
CC Switch Provider Patch for Claude Pulse
Ensures that switching providers in CC Switch will not wipe out the statusline configuration.
"""

import os
import sys
import json
import sqlite3
import shutil
import time

def main():
    home = os.path.expanduser('~')
    db_path = os.path.join(home, '.cc-switch', 'cc-switch.db')
    
    if not os.path.exists(db_path):
        print(f"[-] CC Switch database not found at {db_path}. Skipping patch.")
        return 0

    statusline_path = os.path.join(home, '.claude', 'statusline.cjs').replace('\\', '/')
    cmd_str = f'node "{statusline_path}"' if ' ' in statusline_path else f'node {statusline_path}'
    statusline_config = {
        "type": "command",
        "command": cmd_str,
        "padding": 0
    }

    backup_path = f"{db_path}.bak-pulse"
    try:
        shutil.copy2(db_path, backup_path)
        print(f"[+] Updated backup: {backup_path}")
    except Exception as e:
        print(f"[!] Warning: Failed to create database backup: {e}")

    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        
        # Check providers table
        cur.execute("SELECT id, name, settings_config FROM providers WHERE app_type = 'claude'")
        rows = cur.fetchall()
        
        updated_count = 0
        for pid, name, raw_cfg in rows:
            try:
                cfg = json.loads(raw_cfg) if raw_cfg else {}
                cfg['statusLine'] = statusline_config
                new_cfg_str = json.dumps(cfg, ensure_ascii=False)
                cur.execute("UPDATE providers SET settings_config = ? WHERE id = ?", (new_cfg_str, pid))
                updated_count += 1
            except Exception as e:
                print(f"[!] Error updating provider {name} ({pid}): {e}")

        conn.commit()
        conn.close()
        print(f"[✓] Successfully injected statusLine into {updated_count} Claude provider(s) in CC Switch.")
    except Exception as e:
        print(f"[X] Database update failed: {e}")
        return 1

    return 0

if __name__ == '__main__':
    sys.exit(main())
