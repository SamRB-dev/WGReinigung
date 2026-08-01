from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def run_step(title: str, command: list[str]) -> None:
    print(f"\n==> {title}")
    result = subprocess.run(command, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        raise SystemExit(f"{title} failed with exit code {result.returncode}.")


def normalize_shell_line_endings() -> None:
    print("\n==> Normalizing shell-script line endings")
    for path in PROJECT_ROOT.rglob("*.sh"):
        content = path.read_bytes().replace(b"\r\n", b"\n")
        path.write_bytes(content)


def main() -> None:
    if shutil.which("docker") is None:
        raise SystemExit("Docker is not installed or is not available in PATH.")

    run_step("Checking Docker", ["docker", "version"])
    normalize_shell_line_endings()

    lockfile = PROJECT_ROOT / "package-lock.json"
    if not lockfile.exists():
        run_step(
            "Generating package-lock.json",
            ["docker", "compose", "run", "--rm", "wgclean", "npm", "install"],
        )
    else:
        print("\n==> package-lock.json already exists")

    run_step(
        "Validating configuration and TypeScript",
        ["docker", "compose", "run", "--rm", "wgclean", "validate"],
    )

    run_step(
        "Starting EAS Android APK build",
        ["docker", "compose", "run", "--rm", "wgclean", "build-apk"],
    )

    print("\nAPK build workflow completed successfully.")
    print("Commit package-lock.json if it was newly generated.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBuild cancelled by user.", file=sys.stderr)
        raise SystemExit(130)
