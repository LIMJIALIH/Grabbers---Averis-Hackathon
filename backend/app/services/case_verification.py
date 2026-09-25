"""Use the main-branch parser and independent verifiers for an interactive case."""
from pathlib import Path

from app.core.config import settings
from app.integrations.llm_verifiers import verify_openai, verify_openai_b
from app.services.attachment_text import extract_attachment_text
from app.services.document_fields import extract_fields_from_text
from app.services.llm_verification import apply_verdicts, route_field


def verify_case_documents(documents):
    sources = {'si': [], 'bl': []}
    for name, path in documents:
        side = next((side for side in sources if Path(name).stem.upper().endswith('_' + side.upper())), None)
        if side:
            sources[side].append((name, path))
    texts, statuses = {}, {}
    for side, entries in sources.items():
        texts[side] = ''
        statuses[side] = 'missing' if not entries else 'failed'
        if len(entries) != 1 or entries[0][1] is None:
            continue
        try:
            texts[side] = extract_attachment_text(entries[0][1])
            statuses[side] = 'ok' if texts[side].strip() else 'ocr_needed'
        except Exception:
            statuses[side] = 'failed'
    fields = extract_fields_from_text(texts['si'], texts['bl'])
    audits = [route_field(key=f['key'], label=f['label'], si=f['si'], bl=f['bl'],
                          si_status=statuses['si'], bl_status=statuses['bl']) for f in fields]
    routed = [a for a in audits if a.route.route in {'single_side', 'dual_side'}]
    for audit in audits:
        if audit.route.route == 'ocr_recovery':
            audit.decision = 'unreadable'
            audit.requires_human_review = True
            audit.suggested_resolution = 'Source needs OCR recovery or document selection before verification.'
    if routed:
        try:
            if settings.openai_verifier_model == settings.openai_verifier_b_model:
                raise ValueError('Independent verifier models must differ')
            source = '\n\n'.join(f'[{side.upper()} document]\n{text}' for side, text in texts.items())
            if len(source) > settings.extraction_max_input_chars:
                raise ValueError('Source exceeds the configured input limit')
            a, b = verify_openai(routed, source), verify_openai_b(routed, source)
            for audit in routed:
                apply_verdicts(audit, [v for v in a if v.key == audit.key and v.side in audit.route.applicable_sides],
                               [v for v in b if v.key == audit.key and v.side in audit.route.applicable_sides])
        except Exception:
            for audit in routed:
                audit.decision = 'needs_review'
                audit.requires_human_review = True
                audit.suggested_resolution = 'Independent verification unavailable; check provider configuration and retry.'
    for field, audit in zip(fields, audits):
        if audit.decision == 'approved' and audit.final_value is not None:
            for side in ('si', 'bl'):
                if field[side]:
                    field[side] = audit.final_value
        si, bl = field['si'], field['bl']
        field['confidence'] = 0 if not si and not bl else 60 if not si or not bl else 100 if si == bl else 70
    reasons = [f'{a.label}: {a.suggested_resolution or a.route.reason}' for a in audits if a.requires_human_review]
    return {'fields': fields, 'field_audits': [a.model_dump() for a in audits],
            'extraction_status': 'review_required' if reasons else 'ok',
            'review_reasons': reasons, 'extraction_source': 'Text parser and independent OpenAI verification'}
