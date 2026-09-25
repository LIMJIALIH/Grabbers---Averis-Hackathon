"""DocuVerify email verification orchestration DAG.

The conflict review route is selected by default. Trigger the DAG with
``{"has_conflicts": false}`` to select the clean-email route instead.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from airflow.providers.standard.operators.empty import EmptyOperator
from airflow.providers.standard.operators.python import BranchPythonOperator
from airflow.sdk import DAG, Label, TaskGroup, TriggerRule


DAG_ID = "docuverify_email_prd_v1_dag"


def choose_review_route(**context: object) -> str:
    """Route emails according to the configured conflict status."""

    dag_run = context.get("dag_run")
    run_config = getattr(dag_run, "conf", {}) or {}
    has_conflicts = run_config.get("has_conflicts", True)

    if isinstance(has_conflicts, str):
        has_conflicts = has_conflicts.strip().lower() not in {"false", "0", "no"}

    if has_conflicts:
        return "human_review_gateway.collect_conflict_emails"
    return "no_conflict_detected"


default_args = {
    "owner": "docuverify",
    "retries": 0,
    "retry_delay": timedelta(minutes=1),
}


with DAG(
    dag_id=DAG_ID,
    description="DocuVerify email classification and human-review workflow",
    default_args=default_args,
    start_date=datetime(2026, 9, 1),
    schedule=None,
    catchup=False,
    max_active_runs=1,
    tags=["docuverify", "gmail", "classification", "hitl"],
    doc_md=__doc__,
) as dag:
    start = EmptyOperator(task_id="start_docuverify")

    with TaskGroup(
        group_id="gmail_ingestion",
        tooltip="Gmail collection and email preparation",
    ) as gmail_ingestion:
        connect_to_gmail = EmptyOperator(task_id="connect_to_gmail")
        pull_new_emails = EmptyOperator(task_id="pull_new_emails")
        extract_email_content = EmptyOperator(task_id="extract_email_content")
        normalize_email_data = EmptyOperator(task_id="normalize_email_data")

        (
            connect_to_gmail
            >> pull_new_emails
            >> extract_email_content
            >> normalize_email_data
        )

    with TaskGroup(
        group_id="classification_inference",
        tooltip="Fine-tuned BERT/Jev inference and classification output",
    ) as classification_inference:
        load_finetuned_bert = EmptyOperator(task_id="load_finetuned_bert")
        load_jev_model_future = EmptyOperator(task_id="load_jev_model_future")
        infer_email_classification = EmptyOperator(
            task_id="infer_email_classification"
        )
        generate_classification = EmptyOperator(task_id="generate_classification")
        detect_classification_conflicts = EmptyOperator(
            task_id="detect_classification_conflicts"
        )

        (
            [load_finetuned_bert, load_jev_model_future]
            >> infer_email_classification
            >> generate_classification
            >> detect_classification_conflicts
        )

    route_by_conflict_status = BranchPythonOperator(
        task_id="route_by_conflict_status",
        python_callable=choose_review_route,
    )

    no_conflict_detected = EmptyOperator(task_id="no_conflict_detected")

    with TaskGroup(
        group_id="human_review_gateway",
        tooltip="Human-in-the-loop review for every conflicting email",
    ) as human_review_gateway:
        collect_conflict_emails = EmptyOperator(task_id="collect_conflict_emails")
        send_to_human_reviewer = EmptyOperator(task_id="send_to_human_reviewer")
        wait_for_human_decision = EmptyOperator(task_id="wait_for_human_decision")
        apply_reviewed_classification = EmptyOperator(
            task_id="apply_reviewed_classification"
        )
        confirm_all_conflicts_resolved = EmptyOperator(
            task_id="confirm_all_conflicts_resolved"
        )

        (
            collect_conflict_emails
            >> send_to_human_reviewer
            >> wait_for_human_decision
            >> apply_reviewed_classification
            >> confirm_all_conflicts_resolved
        )

    all_emails_processed = EmptyOperator(
        task_id="all_emails_processed",
        trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
    )
    done = EmptyOperator(task_id="done")

    start >> gmail_ingestion >> classification_inference >> route_by_conflict_status
    route_by_conflict_status >> Label("no conflicts") >> no_conflict_detected
    route_by_conflict_status >> Label("conflicts found") >> human_review_gateway
    [no_conflict_detected, human_review_gateway] >> all_emails_processed >> done
