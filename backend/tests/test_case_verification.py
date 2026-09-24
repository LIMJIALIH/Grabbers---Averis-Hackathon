from pathlib import Path
from unittest.mock import Mock

from app.services import case_verification as service


def documents(monkeypatch, si, bl):
    monkeypatch.setattr(service, 'extract_attachment_text', lambda path: si if path.name.endswith('_SI.txt') else bl)
    return [('sample_SI.txt', Path('sample_SI.txt')), ('sample_BL.txt', Path('sample_BL.txt'))]


def test_matching_fields_skip_providers_and_missing_fields_need_review(monkeypatch):
    provider = Mock(side_effect=AssertionError('Matching values must not call providers'))
    monkeypatch.setattr(service, 'verify_openai', provider)
    result = service.verify_case_documents(documents(monkeypatch, 'Shipper: ACME', 'Shipper: ACME'))
    assert result['field_audits'][0]['decision'] == 'approved'
    assert result['extraction_status'] == 'review_required'
    provider.assert_not_called()


def test_provider_failure_never_approves_disputed_field(monkeypatch):
    monkeypatch.setattr(service, 'verify_openai', Mock(side_effect=RuntimeError('secret provider details')))
    result = service.verify_case_documents(documents(monkeypatch, 'Shipper: ACME', 'Shipper: OTHER'))
    assert result['field_audits'][0]['decision'] == 'needs_review'
    assert 'secret provider details' not in str(result)


def test_unreadable_and_duplicate_documents_require_review(monkeypatch):
    docs = documents(monkeypatch, '', 'Shipper: ACME')
    assert service.verify_case_documents(docs)['field_audits'][0]['decision'] == 'unreadable'
    docs.append(('other_SI.txt', Path('other_SI.txt')))
    assert service.verify_case_documents(docs)['extraction_status'] == 'review_required'


def test_matching_verdicts_use_main_decision_logic(monkeypatch):
    from app.schemas.llm_verification import Evidence, VerifierVerdict
    def verify(audits, source):
        assert '[SI document]' in source and '[BL document]' in source
        return [VerifierVerdict(key='shipper', side=side, status='incorrect', corrected_normalized='acme',
                               evidence=Evidence(text='Shipper: ACME', value_seen='ACME', label_seen='Shipper', source='text'))
                for side in ('si', 'bl')]
    monkeypatch.setattr(service, 'verify_openai', verify)
    monkeypatch.setattr(service, 'verify_openai_b', verify)
    result = service.verify_case_documents(documents(monkeypatch, 'Shipper: ACME', 'Shipper: OTHER'))
    assert result['field_audits'][0]['decision'] == 'approved'
    assert result['fields'][0]['si'] == result['fields'][0]['bl'] == 'acme'
    assert result['fields'][0]['confidence'] == 100


def test_case_endpoint_uses_new_pipeline(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.api.routes import cases
    monkeypatch.setattr(cases, 'find_email', lambda _: {'attachments': ['attachments/sample_SI.txt']})
    monkeypatch.setattr(cases, 'attachment_path', lambda _: Path('sample_SI.txt'))
    verify = Mock(return_value={'fields': [], 'extraction_status': 'review_required', 'review_reasons': ['Missing BL']})
    monkeypatch.setattr(cases, 'verify_case_documents', verify)
    response = TestClient(create_app()).post('/api/v1/cases/sample/extract')
    assert response.status_code == 200
    assert response.json()['review_reasons'] == ['Missing BL']
    verify.assert_called_once_with([('attachments/sample_SI.txt', Path('sample_SI.txt'))])
