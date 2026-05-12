import os
import time
import glob
from pathlib import Path


def delete_older_than(target_dir: str, retention_days: int) -> int:
    target = Path(target_dir).expanduser().resolve()
    if not target.exists():
        return 0

    cutoff = time.time() - (retention_days * 24 * 60 * 60)

    patterns = [
        "*.gz",  # mongo dumps
        "images-backup-*.zip",  # images zips
    ]

    deleted = 0
    for pattern in patterns:
        for fp in target.glob(pattern):
            try:
                st = fp.stat()
                # Use mtime; if you want birthtime, you can swap to st.st_birthtime (macOS only)
                if st.st_mtime < cutoff:
                    fp.unlink()
                    deleted += 1
            except FileNotFoundError:
                pass
            except Exception as e:
                print(f"Cleanup error for {fp}: {e}")
    return deleted


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True)
    parser.add_argument("--retention-days", type=int, default=3)
    args = parser.parse_args()

    deleted = delete_older_than(args.dir, args.retention_days)
    print(f"deleted={deleted}")

