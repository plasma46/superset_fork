import argparse
import pathlib
import sys
import time

import paramiko

LOG_FILE = "/tmp/superset_deploy.log"


def load_env(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def connect(env: dict[str, str], retries: int = 5) -> paramiko.SSHClient:
    for attempt in range(1, retries + 1):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
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
        except Exception as exc:
            sys.stderr.write(f"[attempt {attempt}/{retries}] SSH error: {exc}\n")
            if attempt < retries:
                time.sleep(5)
            else:
                raise


def run(client: paramiko.SSHClient, command: str) -> int:
    _, stdout, stderr = client.exec_command(command, get_pty=False)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        sys.stdout.write(out)
    if err:
        sys.stderr.write(err)
    return code


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command")
    parser.add_argument("--env", default="deploy/server.env")
    parser.add_argument(
        "--bg",
        action="store_true",
        help="Run command in background via nohup, tail log until done",
    )
    args = parser.parse_args()

    env = load_env(pathlib.Path(args.env))

    if args.bg:
        # Launch in background, write output to log, return immediately
        bg_cmd = (
            f"nohup bash -c {repr(args.command)} > {LOG_FILE} 2>&1 & echo $!"
        )
        client = connect(env)
        try:
            pid_code = run(client, bg_cmd)
        finally:
            client.close()

        if pid_code != 0:
            return pid_code

        # Poll log until process exits
        sys.stdout.write(f"Deploy running in background. Tailing {LOG_FILE}...\n")
        offset = 0
        while True:
            time.sleep(10)
            try:
                client = connect(env, retries=3)
            except Exception:
                sys.stdout.write("[waiting for SSH...]\n")
                continue
            try:
                # Read new log content
                _, out, _ = client.exec_command(
                    f"tail -c +{offset + 1} {LOG_FILE}", get_pty=False
                )
                chunk = out.read().decode(errors="replace")
                if chunk:
                    sys.stdout.write(chunk)
                    offset += len(chunk.encode())

                # Check if background process still running
                _, ps_out, _ = client.exec_command(
                    f"pgrep -f 'docker compose' > /dev/null 2>&1 && echo running || echo done",
                    get_pty=False,
                )
                status = ps_out.read().decode().strip()
            finally:
                client.close()

            if status == "done":
                sys.stdout.write("\nDeploy finished.\n")
                break

        return 0

    # Normal blocking mode with retries
    client = connect(env)
    try:
        return run(client, args.command)
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
