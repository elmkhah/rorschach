"""
R-PAS scoring — the same expectations as `core/mock/rpas-scoring.spec.ts`.

If a number here changes, the psychologist's analysis screen changes with it, so
each case pins a formula the documentation states explicitly (docs/10 §6).
"""
from apps.assessments.models import empty_administration
from apps.assessments.rpas.codes import empty_coding
from apps.assessments.rpas.scoring import compute_rpas


def adm(**patch):
    return {**empty_administration(), **patch}


def resp(coding=None, reaction_time_ms=2000):
    return {
        "measurement_data": {
            "reaction_time_ms": reaction_time_ms,
            "card_turns": 0,
            "final_rotation": 0,
        },
        "coding": {**empty_coding(), **coding} if coding else None,
    }


def value(result, key):
    for variables in result["variables"].values():
        for variable in variables:
            if variable["key"] == key:
                return variable["value"]
    raise KeyError(key)


def test_only_administration_variables_when_nothing_is_coded():
    result = compute_rpas([resp(), resp()], adm(prompts=1))

    assert result["R"] == 2
    assert result["coded"] == 0
    assert value(result, "Pr") == 1
    # Coding-derived variables stay null rather than reading as zero.
    assert value(result, "F%") is None
    assert any("R" in finding["basis"] for finding in result["findings"])


def test_colour_responses_are_weighted_into_wsumc_and_mc():
    result = compute_rpas(
        [
            resp({"location": "D", "determinants": ["FC"], "form_quality": "o"}),
            resp({"location": "D", "determinants": ["CF"], "form_quality": "u"}),
            resp({"location": "D", "determinants": ["C"], "form_quality": "n"}),
            resp({"location": "W", "determinants": ["M"], "form_quality": "o"}),
        ],
        adm(),
    )

    # WSumC = 0.5·FC + CF + 1.5·C = 0.5 + 1 + 1.5
    assert value(result, "WSumC") == 3
    # MC = M + WSumC
    assert value(result, "MC") == 4


def test_fq_minus_is_computed_over_form_scored_responses_only():
    result = compute_rpas(
        [
            resp({"location": "W", "determinants": ["F"], "form_quality": "-"}),
            resp({"location": "D", "determinants": ["F"], "form_quality": "o"}),
            # form_quality "n" is not form-scored and must not dilute the ratio.
            resp({"location": "D", "determinants": ["C"], "form_quality": "n"}),
        ],
        adm(),
    )

    assert value(result, "FQ-%") == 0.5
    assert any(finding["domain"] == "PERCEPTION" for finding in result["findings"])


def test_pure_form_counts_only_responses_whose_sole_determinant_is_form():
    result = compute_rpas(
        [
            resp({"determinants": ["F"]}),
            resp({"determinants": ["F", "M"]}),
            resp({"determinants": ["M"]}),
            resp({"determinants": ["F"]}),
        ],
        adm(),
    )

    assert value(result, "F%") == 0.5


def test_cognitive_codes_are_weighted_and_severity_counted():
    result = compute_rpas(
        [
            resp({"cognitive_codes": ["DV1"]}),  # 1
            resp({"cognitive_codes": ["FAB2"]}),  # 7, severe
            resp({"cognitive_codes": ["INC1", "DR1"]}),  # 2 + 3
        ],
        adm(),
    )

    assert value(result, "WSumCog") == 13
    assert value(result, "SevCog") == 1


def test_ppd_and_the_resource_balance():
    result = compute_rpas(
        [
            resp({"determinants": ["FM"]}),
            resp({"determinants": ["m"]}),
            resp({"determinants": ["Y"]}),
            resp({"determinants": ["C'"]}),
            resp({"determinants": ["T"]}),
        ],
        adm(),
    )

    # PPD = FM + m + C' + T + V + Y
    assert value(result, "PPD") == 5
    # MC − PPD with no M and no colour.
    assert value(result, "MC-PPD") == -5
    assert any("MC-PPD" in finding["basis"] for finding in result["findings"])


def test_mean_reaction_time_ignores_missing_measurements():
    result = compute_rpas(
        [resp(reaction_time_ms=1000), resp(reaction_time_ms=3000), resp(reaction_time_ms=None)],
        adm(),
    )

    assert value(result, "RT") == 2000


def test_short_protocol_is_flagged_against_the_recommended_range():
    result = compute_rpas([resp() for _ in range(5)], adm())

    finding = next(f for f in result["findings"] if "R" in f["basis"])
    assert finding["domain"] == "ADMINISTRATION"
    assert finding["confidence"] == "MODERATE"


def test_caveats_always_state_the_limits():
    result = compute_rpas([resp()], adm())

    joined = " ".join(result["caveats"])
    # BR-18: no diagnostic claim, and raw values are never presented as norms.
    assert "هنجار" in joined
    assert "تشخیص" in joined


def test_partial_coding_is_called_out():
    result = compute_rpas([resp({"determinants": ["F"]}), resp()], adm())

    assert result["coded"] == 1
    assert any("کدگذاری کامل نیست" in caveat for caveat in result["caveats"])
