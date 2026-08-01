from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERVICE_NAME = "wgclean"


def run_step(title: str, command: list[str], *, allow_failure: bool = False) -> None:
    print(f"\n==> {title}")
    print("    " + " ".join(command))
    result = subprocess.run(command, cwd=PROJECT_ROOT)
    if result.returncode != 0 and not allow_failure:
        raise SystemExit(f"{title} failed with exit code {result.returncode}.")


def normalize_shell_line_endings() -> None:
    print("\n==> Normalizing shell-script line endings")
    for path in PROJECT_ROOT.rglob("*.sh"):
        content = path.read_bytes().replace(b"\r\n", b"\n")
        path.write_bytes(content)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean Docker resources, rebuild WG Clean, deploy Supabase, and build a new APK.",
    )
    parser.add_argument(
        "--keep-volumes",
        action="store_true",
        help="Keep Docker volumes and cached node_modules. By default, project volumes are removed.",
    )
    parser.add_argument(
        "--skip-deploy",
        action="store_true",
        help="Skip Supabase migrations and Edge Function deployment.",
    )
    parser.add_argument(
        "--skip-apk",
        action="store_true",
        help="Run cleanup, rebuild, dependency install, validation, and deployment without starting EAS.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if shutil.which("docker") is None:
        raise SystemExit("Docker is not installed or is not available in PATH.")

    run_step("Checking Docker", ["docker", "version"])
    run_step("Checking Docker Compose", ["docker", "compose", "version"])
    normalize_shell_line_endings()

    down_command = ["docker", "compose", "down", "--remove-orphans", "--rmi", "local"]
    if not args.keep_volumes:
        down_command.append("--volumes")
    run_step("Removing old containers, networks, and local images", down_command)

    run_step(
        "Removing dangling Docker images",
        ["docker", "image", "prune", "--force"],
    )

    run_step(
        "Building a fresh Docker image without cache",
        ["docker", "compose", "build", "--no-cache", "--pull", SERVICE_NAME],
    )

    run_step(
        "Installing exact JavaScript dependencies",
        ["docker", "compose", "run", "--rm", SERVICE_NAME, "install"],
    )

    run_step(
        "Validating configuration and TypeScript",
        ["docker", "compose", "run", "--rm", SERVICE_NAME, "validate"],
    )

    if not args.skip_deploy:
        run_step(
            "Deploying Supabase migrations and Edge Functions",
            ["docker", "compose", "run", "--rm", SERVICE_NAME, "deploy"],
        )

    if not args.skip_apk:
        run_step(
            "Starting a fresh EAS Android APK build",
            ["docker", "compose", "run", "--rm", SERVICE_NAME, "build-apk"],
        )
        run_step(
            "Showing the latest Android build",
            ["docker", "compose", "run", "--rm", SERVICE_NAME, "status"],
        )

    print("\nFull WG Clean build workflow completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBuild cancelled by user.", file=sys.stderr)
        raise SystemExit(130)
