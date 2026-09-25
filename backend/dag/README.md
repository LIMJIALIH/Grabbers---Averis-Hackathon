# DocuVerify Airflow DAG

The local Airflow environment uses Apache Airflow 3.3.2 and loads DAG files
from this directory.

## Start Airflow on Windows

If Docker Desktop is not installed, install it from PowerShell:

```powershell
winget install --exact --id Docker.DockerDesktop
```

If the installer reports that WSL2 is missing, open PowerShell as
Administrator, run `wsl --install`, and restart Windows. After installation,
launch Docker Desktop from the Start menu and wait for its engine to finish
starting. Open a new PowerShell window and verify the installation:

```powershell
docker --version
docker compose version
```

Then run this command from the project root:

```powershell
docker compose -f backend/docker-compose.airflow.yml up
```

The first run downloads the Airflow image and initializes its local database.
When the startup log reports that Airflow is ready, open
<http://localhost:8080>. The generated administrator login is printed in the
terminal output.

Press **Ctrl+C** to stop Airflow. To start it in the background instead, use:

```powershell
docker compose -f backend/docker-compose.airflow.yml up -d
```

View the generated login or troubleshoot startup with:

```powershell
docker compose -f backend/docker-compose.airflow.yml logs airflow
```

Stop the background container with:

```powershell
docker compose -f backend/docker-compose.airflow.yml down
```

Airflow is intentionally kept out of the backend API's `requirements.txt`.
Apache Airflow does not support running directly on Windows; use this Linux
container or install it inside WSL2.

## WSL2 installation without Docker

From the `backend/` directory in a WSL2 terminal, create a separate Airflow
environment and install the pinned dependencies with Airflow's official
constraint file:

```bash
python3 -m venv .venv-airflow
source .venv-airflow/bin/activate
python -m pip install --upgrade pip
AIRFLOW_VERSION=3.3.2
PYTHON_VERSION="$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
python -m pip install -r requirements-airflow.txt \
  --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt"
```

Start Airflow from the same terminal:

```bash
export AIRFLOW_HOME="$HOME/.docuverify-airflow"
export AIRFLOW__CORE__DAGS_FOLDER="$(pwd)/dag"
airflow standalone
```

Then open <http://localhost:8080>. The administrator credentials are printed
by the `airflow standalone` command.
