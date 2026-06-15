import pathlib
import secrets
import shlex
import string
import sys
import time

import paramiko


ENV_PATH = pathlib.Path("deploy/server.env")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def load_env(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def save_env(path: pathlib.Path, values: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in values:
                out.append(f"{key}={values[key]}")
                seen.add(key)
                continue
        out.append(line)
    missing = [key for key in values if key not in seen]
    if missing:
        out.append("")
        out.append("# Generated deployment secrets")
        out.extend(f"{key}={values[key]}" for key in missing)
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def random_secret(length: int = 48) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def ensure_secrets(env: dict[str, str]) -> dict[str, str]:
    generated: dict[str, str] = {}
    for key in (
        "SUPERSET_ADMIN_PASSWORD",
        "SUPERSET_SECRET_KEY",
        "SUPERSET_DB_PASSWORD",
        "SUPERSET_EXAMPLES_DB_PASSWORD",
    ):
        if not env.get(key):
            generated[key] = random_secret()
    if generated:
        env.update(generated)
        save_env(ENV_PATH, env)
        print(
            "Generated missing deployment secrets in deploy/server.env "
            "(values are not printed)."
        )
    return env


def connect(env: dict[str, str]) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        env["SERVER_HOST"],
        port=int(env.get("SSH_PORT", "22")),
        username=env.get("SERVER_USER", "root"),
        password=env.get("SSH_PASSWORD") or None,
        key_filename=env.get("SSH_KEY_PATH") or None,
        look_for_keys=not bool(env.get("SSH_PASSWORD")),
        allow_agent=not bool(env.get("SSH_PASSWORD")),
        timeout=30,
        auth_timeout=30,
    )
    return client


def run(client: paramiko.SSHClient, command: str, timeout: int | None = None) -> None:
    print(f"\n$ {command}")
    _, stdout, stderr = client.exec_command(command, get_pty=True, timeout=timeout)
    while not stdout.channel.exit_status_ready():
        if stdout.channel.recv_ready():
            sys.stdout.write(stdout.channel.recv(4096).decode(errors="replace"))
            sys.stdout.flush()
        if stdout.channel.recv_stderr_ready():
            sys.stderr.write(stderr.channel.recv_stderr(4096).decode(errors="replace"))
            sys.stderr.flush()
        time.sleep(0.2)
    while stdout.channel.recv_ready():
        sys.stdout.write(stdout.channel.recv(4096).decode(errors="replace"))
    while stdout.channel.recv_stderr_ready():
        sys.stderr.write(stderr.channel.recv_stderr(4096).decode(errors="replace"))
    rc = stdout.channel.recv_exit_status()
    if rc:
        raise RuntimeError(f"Remote command failed with exit code {rc}")


def write_remote_file(client: paramiko.SSHClient, path: str, content: str) -> None:
    sftp = client.open_sftp()
    try:
        with sftp.file(path, "w") as remote:
            remote.write(content)
    finally:
        sftp.close()


def main() -> int:
    env = ensure_secrets(load_env(ENV_PATH))
    app_dir = env.get("REMOTE_APP_DIR", "/opt/superset")
    version = env.get("SUPERSET_VERSION", "6.1.0")
    repo_url = env.get("REPO_URL", "https://github.com/apache/superset.git")
    repo_branch = env.get("REPO_BRANCH", version)
    port = env.get("SUPERSET_PORT", "8088")
    load_examples = env.get("SUPERSET_LOAD_EXAMPLES", "no")
    quoted_dir = shlex.quote(app_dir)
    quoted_version = shlex.quote(version)

    remote_env = f"""COMPOSE_PROJECT_NAME=superset
DEV_MODE=false
FLASK_DEBUG=false
SUPERSET_ENV=production
SUPERSET_LOAD_EXAMPLES={load_examples}
SUPERSET_PORT={port}
PORT={port}
TAG={version}
ADMIN_PASSWORD={env["SUPERSET_ADMIN_PASSWORD"]}
SUPERSET_SECRET_KEY={env["SUPERSET_SECRET_KEY"]}
DATABASE_PASSWORD={env["SUPERSET_DB_PASSWORD"]}
POSTGRES_PASSWORD={env["SUPERSET_DB_PASSWORD"]}
EXAMPLES_PASSWORD={env["SUPERSET_EXAMPLES_DB_PASSWORD"]}
CYPRESS_CONFIG=false
ENABLE_PLAYWRIGHT=false
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
BUILD_SUPERSET_FRONTEND_IN_DOCKER=true
"""

    client = connect(env)
    try:
        run(
            client,
            "set -e; command -v git >/dev/null || "
            "(apt-get update && DEBIAN_FRONTEND=noninteractive "
            "apt-get install -y git ca-certificates)",
        )
        run(
            client,
            f"set -e; if [ -d {quoted_dir}/.git ]; then "
            f"cd {quoted_dir}; git remote set-url origin {shlex.quote(repo_url)}; "
            f"git config --unset-all remote.origin.fetch || true; "
            f"git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'; "
            f"git fetch --no-tags origin; "
            f"git checkout -B {shlex.quote(repo_branch)} origin/{shlex.quote(repo_branch)}; "
            f"git reset --hard origin/{shlex.quote(repo_branch)}; "
            f"else mkdir -p $(dirname {quoted_dir}); "
            f"git clone --branch {shlex.quote(repo_branch)} --depth 1 "
            f"{shlex.quote(repo_url)} {quoted_dir}; fi",
            timeout=900,
        )
        write_remote_file(client, f"{app_dir}/docker/.env-local", remote_env)
        run(
            client,
            f"set -e; cd {quoted_dir}; "
            "docker compose -f docker-compose-non-dev.yml "
            "up -d --build",
            timeout=3600,
        )
        run(
            client,
            f"set -e; cd {quoted_dir}; "
            "docker compose -f docker-compose-non-dev.yml ps",
        )
    finally:
        client.close()
    print(f"\nSuperset target URL: http://{env['SERVER_HOST']}:{port}")
    print("Admin username: admin")
    print("Admin password is stored in deploy/server.env.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
