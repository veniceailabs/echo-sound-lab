#!/usr/bin/env python3
"""
LLM Reasoning Test Harness for Listening Pass Schema

Runs 5 test cases against Gemini API to validate:
1. Correct prioritization
2. Confidence gating
3. Suppressed token handling
4. Friendly Mode tone
5. No hallucination
"""

import json
import sys
import os
from pathlib import Path

try:
    import google.generativeai as genai
except ImportError:
    print("ERROR: google-generativeai not installed")
    print("Install with: pip install google-generativeai")
    sys.exit(1)


def load_prompt_template():
    """Load the locked Gemini prompt template"""
    prompt_file = Path(__file__).parent / "GEMINI_LISTENING_PASS_PROMPT.md"
    if not prompt_file.exists():
        print(f"ERROR: Prompt template not found at {prompt_file}")
        sys.exit(1)

    with open(prompt_file, 'r') as f:
        return f.read()


def load_test_cases():
    """Load the 5 test cases"""
    cases_file = Path(__file__).parent / "LLM_REASONING_TEST_CASES.json"
    if not cases_file.exists():
        print(f"ERROR: Test cases not found at {cases_file}")
        sys.exit(1)

    with open(cases_file, 'r') as f:
        data = json.load(f)

    return data['test_suite']['cases']


def format_test_input(test_case):
    """Format test case as LLM input"""
    return f"""
TEST CASE: {test_case['case_id']} - {test_case['name']}
DESCRIPTION: {test_case['description']}

INPUT SCHEMA:
{json.dumps(test_case['input'], indent=2)}

ANALYZE THIS SCHEMA AND PROVIDE RECOMMENDATIONS FOLLOWING THE LISTENING PASS PROMPT RULES.
"""


def run_test(model, prompt_template, test_case):
    """Run a single test case against Gemini"""
    test_input = format_test_input(test_case)

    try:
        response = model.generate_content(
            f"{prompt_template}\n\n{test_input}"
        )
        return {
            "case_id": test_case['case_id'],
            "name": test_case['name'],
            "status": "success",
            "output": response.text,
            "expected_behavior": test_case['expected_behavior']
        }
    except Exception as e:
        return {
            "case_id": test_case['case_id'],
            "name": test_case['name'],
            "status": "error",
            "error": str(e),
            "expected_behavior": test_case['expected_behavior']
        }


def validate_output(result):
    """
    Basic validation of output against expected behavior.

    This is a heuristic check; full validation requires human review.
    """
    if result['status'] == 'error':
        return False, f"LLM error: {result['error']}"

    output = result['output'].lower()
    expected = result['expected_behavior']

    checks = []

    # Case A: Pure Fatigue
    if result['case_id'] == 'A':
        checks.append(('recommendation_exists', 'fatigue' in output or 'consider' in output))
        checks.append(('no_stage_2_plus', 'saturation' not in output and 'reverb' not in output))
        checks.append(('affirms_intelligibility', 'intelligible' in output or 'clear' in output))
        checks.append(('confidence_reported', '0.8' in output or '81' in output))

    # Case B: All Clear
    elif result['case_id'] == 'B':
        checks.append(('affirming_tone', 'working' in output or 'good' in output or '✓' in result['output']))
        checks.append(('no_suggestions', 'suggest' not in output or 'no ' in output and 'suggest' in output))

    # Case C: Conflict
    elif result['case_id'] == 'C':
        checks.append(('addresses_fatigue', 'fatigue' in output))
        checks.append(('fatigue_prioritized', 'first' in output or 'fatigue' in output.split('\n')[0]))

    # Case D: Low confidence gate
    elif result['case_id'] == 'D':
        checks.append(('addresses_instability', 'instability' in output or 'erratic' in output or 'nervous' in output))
        checks.append(('instability_high_confidence', '0.9' in output or '92' in output))
        checks.append(('low_confidence_gated', result['case_id'] in result['output'] or 'confidence' in output))

    # Case E: Suppressed token
    elif result['case_id'] == 'E':
        checks.append(('no_instability_mention', 'instability' not in output or 'rhythm' in output and 'intentional' in output))
        checks.append(('affirming', 'working' in output or 'clear' in output))

    passed = sum(1 for _, check in checks if check)
    total = len(checks)

    return passed == total, f"{passed}/{total} checks passed: {checks}"


def main():
    """Main test runner"""
    # Initialize Gemini API
    api_key = os.getenv('GOOGLE_GENAI_API_KEY')
    if not api_key:
        print("ERROR: GOOGLE_GENAI_API_KEY environment variable not set")
        print("Set it with: export GOOGLE_GENAI_API_KEY='your-api-key'")
        sys.exit(1)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.0-flash')

    # Load resources
    print("Loading resources...")
    prompt_template = load_prompt_template()
    test_cases = load_test_cases()

    print(f"Loaded {len(test_cases)} test cases")
    print("\n" + "="*80)

    # Run tests
    results = []
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}] Running Case {test_case['case_id']}: {test_case['name']}...")
        result = run_test(model, prompt_template, test_case)
        results.append(result)

        # Validate
        passed, validation_msg = validate_output(result)
        result['validation'] = {'passed': passed, 'message': validation_msg}

        print(f"Status: {result['status']}")
        if result['status'] == 'success':
            print(f"Validation: {'PASS' if passed else 'FAIL'} - {validation_msg}")

    # Save results
    print("\n" + "="*80)
    print("\nSaving results...")
    results_file = Path(__file__).parent / "LLM_REASONING_TEST_RESULTS.json"

    with open(results_file, 'w') as f:
        json.dump({
            'test_suite': {
                'total_cases': len(test_cases),
                'passed': sum(1 for r in results if r.get('validation', {}).get('passed', False)),
                'failed': sum(1 for r in results if not r.get('validation', {}).get('passed', True)),
                'results': results
            }
        }, f, indent=2)

    print(f"Results saved to {results_file}")

    # Summary
    passed_count = sum(1 for r in results if r.get('validation', {}).get('passed', False))
    total_count = len(test_cases)

    print(f"\n{'='*80}")
    print(f"TEST SUMMARY: {passed_count}/{total_count} cases passed")
    print(f"{'='*80}\n")

    # Print full results for inspection
    for result in results:
        print(f"\n{'='*80}")
        print(f"CASE {result['case_id']}: {result['name']}")
        print(f"{'='*80}")
        print(f"Status: {result['status']}")
        if result['status'] == 'success':
            print(f"Validation: {result['validation']['message']}")
            print(f"\nOutput:\n{result['output']}")
        else:
            print(f"Error: {result.get('error', 'Unknown error')}")

    return 0 if passed_count == total_count else 1


if __name__ == '__main__':
    sys.exit(main())
